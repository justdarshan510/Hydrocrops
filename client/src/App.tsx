import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import { DEFAULT_PARSED_DATA, parseCSV } from "@/lib/csvData";
import { type HydroponicImageRecord } from "@/lib/hydroponicMetadata";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import LandingPage from "@/components/LandingPage";
import ClassifierHome from "@/components/ClassifierHome";

function Router() {
  const [, setLocation] = useLocation();

  // Persistent dataset training state shared across website & dashboard
  const [dataset, setDataset] = useState<HydroponicImageRecord[]>(() => {
    try {
      const cached = localStorage.getItem("phyto_dataset");
      return cached ? JSON.parse(cached) : DEFAULT_PARSED_DATA;
    } catch {
      return DEFAULT_PARSED_DATA;
    }
  });

  const [filename, setFilename] = useState(() => {
    return localStorage.getItem("phyto_filename") || "metadata.csv (Default)";
  });

  // Persist dataset state changes to local storage
  useEffect(() => {
    localStorage.setItem("phyto_dataset", JSON.stringify(dataset));
    localStorage.setItem("phyto_filename", filename);
  }, [dataset, filename]);

  // Auto-Load Custom CSV from server backend (matches original Dashboard startup)
  useEffect(() => {
    const loadCustomDataset = async () => {
      try {
        const res = await fetch("/api/dataset/custom-csv");
        if (res.ok) {
          const { content, filename: remoteName } = await res.json();
          const parsed = parseCSV(content);
          if (parsed.length > 0) {
            setDataset(parsed);
            setFilename(remoteName);
            console.log("Auto-loaded industrial dataset in root:", remoteName);
          }
        }
      } catch (e) {
        console.warn("Custom dataset auto-load failed in root.");
      }
    };
    loadCustomDataset();
  }, []);

  return (
    <Switch>
      <Route path="/">
        <LandingPage onEnter={() => setLocation("/scan")} />
      </Route>
      <Route path="/scan">
        <ClassifierHome
          data={dataset}
          activeFilename={filename}
          onGoToDashboard={() => setLocation("/dashboard")}
          onGoToLanding={() => setLocation("/")}
        />
      </Route>
      <Route path="/dashboard">
        <Dashboard
          dataset={dataset}
          setDataset={setDataset}
          filename={filename}
          setFilename={setFilename}
        />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
