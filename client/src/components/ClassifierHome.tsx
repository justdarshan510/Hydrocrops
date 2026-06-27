import React, { useMemo, useRef, useState } from 'react';
import { Sprout, Upload, Sparkles, AlertTriangle, Check, RefreshCw, BarChart2, ShieldAlert } from 'lucide-react';
import { extractMetadataFromImageBlob, type HydroponicImageRecord } from '@/lib/hydroponicMetadata';
import { DEFAULT_PARSED_DATA } from '@/lib/csvData';
import { REMEDIAL_MEASURES } from '@/lib/mockData';
import * as ss from 'simple-statistics';
import { Button } from '@/components/ui/button';

interface ClassifierHomeProps {
  data: HydroponicImageRecord[];
  activeFilename?: string;
  onGoToDashboard: () => void;
  onGoToLanding: () => void;
}

const FEATURE_FIELDS = [
  { key: 'Mean_R', label: 'Red Channel' },
  { key: 'Mean_G', label: 'Green Channel' },
  { key: 'Mean_B', label: 'Blue Channel' },
  { key: 'Brightness', label: 'Brightness' },
  { key: 'Saturation_Pct', label: 'Saturation' },
  { key: 'Green_Coverage_Pct', label: 'Green Area' },
  { key: 'Excess_Green_Index', label: 'Excess Green' },
  { key: 'Contrast', label: 'Contrast' },
  { key: 'Edge_Density', label: 'Edge Density' },
  { key: 'Leaf_Area_Ratio', label: 'Leaf Area Ratio' },
  { key: 'Homogeneity', label: 'Texture Homogeneity' },
] as const;

type FieldKey = (typeof FEATURE_FIELDS)[number]['key'];

interface DiagnosticResult {
  class: string;
  confidence: number;
  explanation: string;
  featureNotes: string[];
}

const IMAGE_CLASSIFIER_LABELS = ['Healthy', 'K Deficiency', 'N Deficiency', 'P Deficiency', 'Fungal Infection'] as const;

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeValue(value: number, mean: number, deviation: number) {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(deviation) || deviation === 0) return value - mean;
  return (value - mean) / deviation;
}

export default function ClassifierHome({ data, activeFilename, onGoToDashboard, onGoToLanding }: ClassifierHomeProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [extractedFeatures, setExtractedFeatures] = useState<HydroponicImageRecord | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sovereignty KNN Model Initialization (derived from ImageDiagnostics.tsx)
  const model = useMemo(() => {
    const globalData = DEFAULT_PARSED_DATA.map((r) => ({ ...r, _isGlobal: true }));
    const isCustomDataset = activeFilename && activeFilename !== 'metadata.csv (Default)';
    const localData = isCustomDataset
      ? data.map((r, i) => ({ ...r, Image_ID: `local_${r.Image_ID || i}`, _isGlobal: false }))
      : [];

    const combinedData = [...globalData, ...localData];
    const uniqueMap = new Map();
    combinedData.forEach((r) => uniqueMap.set(r.Image_ID, r));
    const finalData = Array.from(uniqueMap.values());

    const labeledData = finalData.filter(
      (record) =>
        record.Class_Label !== 'Unknown' &&
        IMAGE_CLASSIFIER_LABELS.includes(record.Class_Label as (typeof IMAGE_CLASSIFIER_LABELS)[number]),
    );

    if (labeledData.length < 5) return null;

    const globalLabeled = globalData.filter(
      (record) =>
        record.Class_Label !== 'Unknown' &&
        IMAGE_CLASSIFIER_LABELS.includes(record.Class_Label as (typeof IMAGE_CLASSIFIER_LABELS)[number]),
    );
    if (globalLabeled.length < 5) return null;
    const localLabeled = localData.filter(
      (record) =>
        record.Class_Label !== 'Unknown' &&
        IMAGE_CLASSIFIER_LABELS.includes(record.Class_Label as (typeof IMAGE_CLASSIFIER_LABELS)[number]),
    );

    const statsSource = isCustomDataset && localLabeled.length >= 20 ? localLabeled : globalLabeled;

    const featureStats = Object.fromEntries(
      FEATURE_FIELDS.map(({ key }) => {
        const series = statsSource.map((record) => Number(record[key]));
        return [
          key,
          {
            mean: ss.mean(series),
            deviation: ss.standardDeviation(series) || 1e-6,
          },
        ];
      }),
    ) as Record<FieldKey, { mean: number; deviation: number }>;

    const samples = labeledData.map((record) => ({
      label: record.Class_Label,
      raw: record,
      values: Object.fromEntries(
        FEATURE_FIELDS.map(({ key }) => [
          key,
          normalizeValue(Number(record[key]), featureStats[key].mean, featureStats[key].deviation),
        ]),
      ) as Record<FieldKey, number>,
    }));

    const rawGroupedByClass = Array.from(
      labeledData.reduce((map, record) => {
        if (!map.has(record.Class_Label)) map.set(record.Class_Label, []);
        map.get(record.Class_Label)?.push(record);
        return map;
      }, new Map<string, HydroponicImageRecord[]>()),
    ) as Array<[string, HydroponicImageRecord[]]>;

    return {
      featureStats,
      samples,
      k: Math.min(7, Math.max(5, Math.floor(Math.sqrt(samples.length)))),
      classCentroids: Array.from(
        samples.reduce((map, sample) => {
          if (!map.has(sample.label)) map.set(sample.label, []);
          map.get(sample.label)?.push(sample);
          return map;
        }, new Map<string, typeof samples>()),
      ).map(([label, records]) => ({
        label,
        centroid: Object.fromEntries(
          FEATURE_FIELDS.map(({ key }) => [key, ss.mean(records.map((record) => Number(record.values[key])))]),
        ) as Record<FieldKey, number>,
      })),
      rawClassCentroids: rawGroupedByClass.map(([label, records]) => ({
        label,
        centroid: Object.fromEntries(
          FEATURE_FIELDS.map(({ key }) => [key, ss.mean(records.map((record) => Number(record[key])))]),
        ) as Record<FieldKey, number>,
      })),
    };
  }, [data, activeFilename]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setUploadedFile(file);
    setSelectedImage(URL.createObjectURL(file));
    setResult(null);
    setExtractedFeatures(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      const file = e.dataTransfer.files[0];
      setUploadedFile(file);
      setSelectedImage(URL.createObjectURL(file));
      setResult(null);
      setExtractedFeatures(null);
    }
  };

  const analyzeImage = async () => {
    if (!selectedImage || !model) return;

    setIsAnalyzing(true);

    try {
      const blob = uploadedFile ?? (await fetch(selectedImage).then((r) => r.blob()));
      const metadata = await extractMetadataFromImageBlob(
        blob,
        uploadedFile?.name ?? 'uploaded-leaf.png',
        uploadedFile?.name ?? selectedImage,
      );

      setExtractedFeatures(metadata);

      const normalizedInput = Object.fromEntries(
        FEATURE_FIELDS.map(({ key }) => [
          key,
          normalizeValue(Number(metadata[key]), model.featureStats[key].mean, model.featureStats[key].deviation),
        ]),
      ) as Record<FieldKey, number>;

      const isCustomDataset = activeFilename && activeFilename !== 'metadata.csv (Default)';
      const globalSamples = model.samples.filter((s) => (s.raw as any)._isGlobal);
      const localSamples = model.samples.filter((s) => !(s.raw as any)._isGlobal);
      const activeSamples = isCustomDataset && localSamples.length >= 12 ? localSamples : globalSamples;

      const FEATURE_WEIGHTS: Record<string, number> = {
        Contrast: 2.2,
        Edge_Density: 1.8,
        Homogeneity: 1.4,
        Saturation_Pct: 1.2,
        Excess_Green_Index: 1.0,
        Leaf_Area_Ratio: 1.0,
      };

      const calcDistance = (sample: (typeof globalSamples)[0]) =>
        Math.sqrt(
          FEATURE_FIELDS.reduce((acc, { key }) => {
            const weight = FEATURE_WEIGHTS[key] || 1.0;
            return acc + (normalizedInput[key] - sample.values[key]) ** 2 * weight;
          }, 0),
        );

      const rankedActiveSamples = activeSamples
        .map((sample) => ({
          label: sample.label,
          distance: calcDistance(sample),
          raw: sample.raw,
        }))
        .sort((a, b) => a.distance - b.distance);

      const nearestOverall = rankedActiveSamples[0];
      const nearestNeighbors = rankedActiveSamples.slice(0, model.k);

      const closestLabelNeighbors = nearestNeighbors.reduce((map, neighbor) => {
        map.set(neighbor.label, (map.get(neighbor.label) ?? 0) + 1);
        return map;
      }, new Map<string, number>());

      const weightedVotes = nearestNeighbors.reduce((map, neighbor) => {
        const weight = 1 / (neighbor.distance + 1e-6);
        map.set(neighbor.label, (map.get(neighbor.label) ?? 0) + weight);
        return map;
      }, new Map<string, number>());

      const sortedVotes = Array.from(weightedVotes.entries()).sort((a, b) => b[1] - a[1]);
      const voteWinner = sortedVotes[0]?.[0] ?? 'Unknown';
      const voteTotal = sortedVotes.reduce((sum, [, score]) => sum + score, 0);
      const voteConfidence = voteTotal > 0 ? ((sortedVotes[0]?.[1] ?? 0) / voteTotal) * 100 : 0;

      const centroidRanking = model.classCentroids
        .map((entry) => ({
          label: entry.label,
          distance: Math.sqrt(
            FEATURE_FIELDS.reduce((acc, { key }) => {
              const weight = FEATURE_WEIGHTS[key] || 1.0;
              return acc + (normalizedInput[key] - entry.centroid[key]) ** 2 * weight;
            }, 0),
          ),
        }))
        .sort((a, b) => a.distance - b.distance);

      const centroidWinner = centroidRanking[0]?.label ?? 'Unknown';
      const centroidMargin =
        (centroidRanking[1]?.distance ?? Number.POSITIVE_INFINITY) - (centroidRanking[0]?.distance ?? 0);

      const averageTopDistance = (samplesForClass: typeof globalSamples, topK: number) => {
        if (!samplesForClass.length) return Number.POSITIVE_INFINITY;
        const distances = samplesForClass
          .map((sample) => calcDistance(sample))
          .sort((a, b) => a - b)
          .slice(0, Math.min(topK, samplesForClass.length));
        return ss.mean(distances);
      };

      const bestClassDistance = averageTopDistance(
        activeSamples.filter((sample) => sample.label === voteWinner),
        Math.min(5, model.k),
      );
      const secondClassDistance = averageTopDistance(
        activeSamples.filter((sample) => sample.label === (sortedVotes[1]?.[0] ?? 'Unknown')),
        Math.min(5, model.k),
      );
      const classDistanceMargin = secondClassDistance - bestClassDistance;

      const minDistance = nearestOverall?.distance ?? 0;
      const greenPct = Number(metadata.Green_Coverage_Pct);
      const leafRatio = Number(metadata.Leaf_Area_Ratio);
      const edgeDensity = Number(metadata.Edge_Density);
      const contrast = Number(metadata.Contrast);
      const saturation = Number(metadata.Saturation_Pct);
      const exg = Number(metadata.Excess_Green_Index);
      const homogeneity = Number(metadata.Homogeneity);

      let botanyScore = 0;
      if (homogeneity >= 15 && homogeneity <= 85) botanyScore += 1;
      if (edgeDensity >= 0.03 && edgeDensity <= 0.45) botanyScore += 1;
      if (exg > 1.2 && greenPct > 15) botanyScore += 1;
      if (saturation < 92 && contrast < 210) botanyScore += 1;
      if (leafRatio > 0.05) botanyScore += 1;

      if (edgeDensity > 0.55) botanyScore -= 5;
      if (contrast > 240) botanyScore -= 5;
      if (saturation > 98) botanyScore -= 5;
      if (homogeneity > 94) botanyScore -= 5;

      const isVeryCloseMatch = minDistance < 2.2;
      const isNotAPlant = isCustomDataset
        ? botanyScore < 2 && minDistance > 7.2
        : (botanyScore < 2 && !isVeryCloseMatch) || botanyScore < 1;

      let predictedClass = 'Unknown';
      let confidence = 0;
      let matchingNeighborsCount = 0;

      if (isNotAPlant) {
        predictedClass = 'Not a Plant';
      } else {
        const winnersAgree = voteWinner === centroidWinner;
        const hasStrongLocalEvidence =
          voteConfidence >= 42 ||
          (closestLabelNeighbors.get(voteWinner) || 0) >= Math.ceil(model.k / 2) && minDistance < 3.8 ||
          classDistanceMargin > 0.18 ||
          centroidMargin > 0.18;

        predictedClass = voteWinner;
        confidence = round(
          Math.max(
            35,
            Math.min(
              99,
              voteConfidence * 0.75 +
                Math.max(0, 28 - minDistance * 4.2) +
                (winnersAgree ? 8 : 0) +
                Math.max(0, classDistanceMargin * 18),
            ),
          ),
          1,
        );
        matchingNeighborsCount = closestLabelNeighbors.get(predictedClass) ?? 0;

        if (
          predictedClass === 'Unknown' ||
          (!hasStrongLocalEvidence && minDistance > 4.9) ||
          (voteConfidence < 34 && !winnersAgree && minDistance > 4.2)
        ) {
          predictedClass = 'Unknown';
          confidence = 0;
        }
      }

      if (
        predictedClass !== 'Unknown' &&
        predictedClass !== 'Not a Plant' &&
        (closestLabelNeighbors.get(predictedClass) ?? 0) === 0
      ) {
        predictedClass = 'Unknown';
        confidence = 0;
      }

      const centroid = model.rawClassCentroids.find((entry) => entry.label === predictedClass)?.centroid;
      const featureNotes = centroid
        ? FEATURE_FIELDS.map(({ key, label }) => {
            const value = Number(metadata[key]);
            const delta = round(value - centroid[key], key === 'Green_Coverage_Pct' ? 1 : 2);
            return `The image has ${delta >= 0 ? 'higher' : 'lower'} ${label} than the average ${predictedClass} sample by ${Math.abs(delta)}.`;
          })
            .slice(0, 3)
        : [];

      const explanation =
        predictedClass === 'Not a Plant'
          ? 'Digital Artifact/Non-Organic Specimen: Subject identified as vector graphics, a logo, or background details.'
          : predictedClass === 'Unknown'
            ? 'The leaf features are plant-like, but they do not match deficiency database profiles strongly enough for a definitive diagnosis.'
            : predictedClass === 'Healthy'
              ? `${matchingNeighborsCount} of the closest reference samples match Healthy, reflecting optimal pigment balance and leaf structure.`
              : `${matchingNeighborsCount} of the closest reference samples match ${predictedClass}, indicating significant deficiency markers.`;

      // Mock delay for premium visual analysis experience
      setTimeout(() => {
        setResult({
          class: predictedClass,
          confidence: isNotAPlant ? 0 : confidence,
          explanation,
          featureNotes,
        });
        setIsAnalyzing(false);
      }, 2200);
    } catch (error) {
      console.error(error);
      setResult({
        class: 'Unknown',
        confidence: 0,
        explanation: 'Image processing failed. Please ensure the image is clear and contains a single plant leaf.',
        featureNotes: [],
      });
      setIsAnalyzing(false);
    }
  };

  const resetScanner = () => {
    setSelectedImage(null);
    setUploadedFile(null);
    setResult(null);
    setExtractedFeatures(null);
  };

  const remedial = result ? REMEDIAL_MEASURES[result.class as keyof typeof REMEDIAL_MEASURES] : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none pb-12">
      <style>{`
        .glass-panel {
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .glass-panel-light {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .text-glow {
          text-shadow: 0 0 12px rgba(52, 211, 153, 0.4);
        }
        .scan-laser {
          background: linear-gradient(to bottom, transparent, rgba(52, 211, 153, 0.5), transparent);
          animation: scan 2s linear infinite;
        }
        @keyframes scan {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
      `}</style>

      {/* Top Navbar */}
      <header className="flex justify-between items-center px-12 py-6 border-b border-white/5 backdrop-blur-md bg-slate-950/40 sticky top-0 z-30">
        <div className="flex items-center gap-2 cursor-pointer" onClick={onGoToLanding}>
          <div className="rounded-lg bg-emerald-500/10 p-2 ring-1 ring-emerald-500/20">
            <Sprout className="h-5 w-5 text-emerald-400" />
          </div>
          <span className="font-serif-elegant text-xl font-bold tracking-wider text-white">hydrocrops</span>
        </div>

        <nav className="flex items-center gap-8 text-sm">
          <button
            onClick={onGoToLanding}
            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Home
          </button>
          <button
            onClick={() => alert('Hydrocrops IOT service monitors and analyzes hydroponic plants using deep neural models and local dataset sovereignty.')}
            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            About
          </button>
          <button
            onClick={onGoToDashboard}
            className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-semibold transition-colors cursor-pointer"
          >
            <BarChart2 className="h-4 w-4" />
            Dashboard
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-10 w-full flex flex-col items-center">
        {/* Title */}
        <div className="text-center space-y-3 mb-10 max-w-2xl">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white">
            Hydroponic Nutrient Classifier
          </h1>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            Real-time phytodiagnosis and diagnostic scanning. Upload or drag-and-drop a leaf specimen to analyze health status.
          </p>
        </div>

        {/* Dynamic Scan Interface */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT: The Glass Dome / Plant Preview */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-full max-w-[380px] aspect-[4/5] rounded-[3rem] border border-white/10 glass-panel shadow-2xl p-6 flex flex-col justify-between overflow-hidden">
              {/* Glass dome highlights */}
              <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/10 pointer-events-none rounded-[3rem]" />
              <div className="absolute top-0 left-1/4 right-1/4 h-[30%] bg-gradient-to-b from-white/15 to-transparent rounded-full filter blur-xl pointer-events-none" />

              {/* Glowing Seedling Container */}
              <div className="flex-1 flex items-center justify-center relative">
                {selectedImage ? (
                  <div className="relative w-full h-full max-h-[300px] rounded-2xl overflow-hidden border border-white/10 bg-slate-900/50">
                    <img
                      src={selectedImage}
                      alt="Uploaded Leaf Specimen"
                      className="w-full h-full object-contain"
                    />
                    {isAnalyzing && (
                      <div className="absolute left-0 right-0 w-full h-[6px] scan-laser pointer-events-none" />
                    )}
                  </div>
                ) : (
                  <div className="relative w-full h-full flex flex-col items-center justify-center">
                    <img
                      src="/glass_dome_plant.png"
                      alt="Glass Dome Plant Seedling"
                      className="w-full h-full object-contain max-h-[300px] opacity-75 filter drop-shadow-[0_0_20px_rgba(52,211,153,0.3)] animate-pulse"
                    />
                  </div>
                )}
              </div>

              {/* Bottom Info badge */}
              <div className="relative z-10 rounded-2xl glass-panel-light p-3 flex justify-between items-center text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${selectedImage ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
                  {selectedImage ? 'Specimen Mounted' : 'Dome Empty'}
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  {selectedImage ? (uploadedFile?.name ? uploadedFile.name.substring(0, 16) + '...' : 'Demo.png') : '0.0.0_ACTIVE'}
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT: Upload Card / Analysis Results */}
          <div className="lg:col-span-7 w-full">
            {!result && !isAnalyzing ? (
              /* INPUT/UPLOAD STATE */
              <div
                className={`w-full rounded-[2.5rem] p-10 glass-panel shadow-xl border-2 border-dashed transition-all duration-300 ${
                  isDragging
                    ? 'border-emerald-400/60 bg-emerald-500/5 shadow-[0_0_30px_rgba(52,211,153,0.1)]'
                    : 'border-white/10 hover:border-emerald-500/30'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="rounded-full bg-emerald-500/10 p-6 border border-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.1)]">
                    <Upload className="h-10 w-10" />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-white">Upload Image</h3>
                    <p className="text-sm text-slate-400 max-w-sm">
                      Drag and drop your crop image here or click browse to import from your machine
                    </p>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept="image/*"
                  />

                  <div className="flex gap-4">
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-6 py-2.5 rounded-full border border-slate-700 bg-slate-900/50 hover:bg-slate-900 text-slate-200 transition-all font-medium text-xs tracking-wider uppercase cursor-pointer"
                    >
                      Browse Files
                    </Button>
                    {selectedImage && (
                      <Button
                        onClick={analyzeImage}
                        className="px-8 py-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold transition-all shadow-[0_0_20px_rgba(52,211,153,0.3)] text-xs tracking-wider uppercase flex items-center gap-2 cursor-pointer"
                      >
                        <Sparkles className="h-4 w-4" />
                        Scan Now
                      </Button>
                    )}
                  </div>

                  {/* Demo/Sample Files container */}
                  <div className="w-full pt-8 border-t border-white/5">
                    <span className="text-[10px] tracking-[0.2em] uppercase text-slate-500 block mb-4">
                      Test with Sample Specimens
                    </span>
                    <div className="flex justify-center gap-4 flex-wrap">
                      <button
                        onClick={() => {
                          setSelectedImage('/local-dataset/healthy/pml (1).jpg');
                          setUploadedFile(null);
                        }}
                        className="text-xs px-4 py-2 rounded-full border border-white/5 glass-panel-light hover:border-emerald-500/30 hover:text-emerald-400 transition-all cursor-pointer"
                      >
                        Healthy Leaf Sample
                      </button>
                      <button
                        onClick={() => {
                          setSelectedImage('/local-dataset/unhealthy/k_def_1.png');
                          setUploadedFile(null);
                        }}
                        className="text-xs px-4 py-2 rounded-full border border-white/5 glass-panel-light hover:border-amber-500/30 hover:text-amber-400 transition-all cursor-pointer"
                      >
                        Potassium Deficient
                      </button>
                      <button
                        onClick={() => {
                          setSelectedImage('/local-dataset/unhealthy/n_def_1.png');
                          setUploadedFile(null);
                        }}
                        className="text-xs px-4 py-2 rounded-full border border-white/5 glass-panel-light hover:border-yellow-500/30 hover:text-yellow-400 transition-all cursor-pointer"
                      >
                        Nitrogen Deficient
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : isAnalyzing ? (
              /* SCANNING/LOADING STATE */
              <div className="w-full rounded-[2.5rem] p-10 glass-panel shadow-xl flex flex-col items-center justify-center text-center py-20 space-y-6">
                <div className="relative">
                  {/* Glowing spinning ring */}
                  <div className="h-20 w-20 rounded-full border-4 border-slate-800 border-t-emerald-400 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sprout className="h-8 w-8 text-emerald-400 animate-pulse" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-white tracking-wide text-glow">
                    Analyzing Spectral Profile...
                  </h3>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto animate-pulse">
                    Extracting color channel histograms, texture homogeneity indexes, and structural edge densities.
                  </p>
                </div>
              </div>
            ) : (
              /* RESULTS STATE */
              <div className="w-full rounded-[2.5rem] p-8 glass-panel shadow-2xl space-y-8 animate-in fade-in zoom-in-95 duration-500">
                {/* Result header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-white/5">
                  <div className="space-y-1.5">
                    <span className="text-[10px] tracking-[0.25em] uppercase text-slate-500">
                      Diagnostics Output
                    </span>
                    <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
                      {result.class === 'Healthy' ? (
                        <Check className="h-7 w-7 text-emerald-400 bg-emerald-500/10 p-1 rounded-full border border-emerald-500/20" />
                      ) : result.class === 'Not a Plant' ? (
                        <ShieldAlert className="h-7 w-7 text-red-400 bg-red-500/10 p-1 rounded-full border border-red-500/20" />
                      ) : (
                        <AlertTriangle className="h-7 w-7 text-amber-400 bg-amber-500/10 p-1 rounded-full border border-amber-500/20" />
                      )}
                      {result.class}
                    </h2>
                  </div>

                  {result.class !== 'Not a Plant' && result.class !== 'Unknown' && (
                    <div className="text-right">
                      <span className="text-[10px] tracking-[0.25em] uppercase text-slate-500 block">
                        Confidence
                      </span>
                      <span className="text-3xl font-black text-emerald-400 text-glow">
                        {result.confidence}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Explanation text */}
                <div className="rounded-2xl glass-panel-light p-5 border border-white/5 text-sm leading-relaxed text-slate-300">
                  <p>{result.explanation}</p>
                </div>

                {/* Feature Notes / Analytical breakdown */}
                {result.featureNotes && result.featureNotes.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Spectral & Texture Markers Detected
                    </h3>
                    <ul className="space-y-2">
                      {result.featureNotes.map((note, index) => (
                        <li key={index} className="text-xs text-slate-400 flex items-start gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Remedial Measures */}
                {remedial && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 space-y-4">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <Sparkles className="h-5 w-5" />
                      <h3 className="text-sm font-semibold tracking-wider uppercase">
                        Recommended Treatment Protocol
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs leading-relaxed text-slate-300">
                      <div>
                        <span className="font-semibold text-emerald-400 block mb-1">Immediate Measures:</span>
                        <ul className="list-disc pl-4 space-y-1">
                          {(remedial.immediate ?? []).map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="font-semibold text-emerald-400 block mb-1">Long-term Prevention:</span>
                        <ul className="list-disc pl-4 space-y-1">
                          {(remedial.longTerm ?? []).map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Reset & Navigation Controls */}
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <Button
                    onClick={resetScanner}
                    className="flex-1 px-6 py-3 rounded-full border border-slate-700 bg-slate-900/50 hover:bg-slate-900 text-slate-200 transition-all font-medium text-xs tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Scan Another Leaf
                  </Button>
                  <Button
                    onClick={onGoToDashboard}
                    className="flex-1 px-6 py-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all text-xs tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <BarChart2 className="h-4 w-4" />
                    View Detailed Charts
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
