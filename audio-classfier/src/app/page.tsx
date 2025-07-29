"use client"


import { get } from "http";
import { useState } from "react";
import { vi } from "zod/v4/locales";
import ColorScale from "~/components/ColorScale";
import FeatureMap from "~/components/FeatureMap";
import Waveform from "~/components/Waveform";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";


const ESC50_EMOJI_MAP: Record<string, string> = {
  dog: "🐕",
  rain: "🌧️",
  crying_baby: "👶",
  door_wood_knock: "🚪",
  helicopter: "🚁",
  rooster: "🐓",
  sea_waves: "🌊",
  sneezing: "🤧",
  mouse_click: "🖱️",
  chainsaw: "🪚",
  pig: "🐷",
  crackling_fire: "🔥",
  clapping: "👏",
  keyboard_typing: "⌨️",
  siren: "🚨",
  cow: "🐄",
  crickets: "🦗",
  breathing: "💨",
  door_wood_creaks: "🚪",
  car_horn: "📯",
  frog: "🐸",
  chirping_birds: "🐦",
  coughing: "😷",
  can_opening: "🥫",
  engine: "🚗",
  cat: "🐱",
  water_drops: "💧",
  footsteps: "👣",
  washing_machine: "🧺",
  train: "🚂",
  hen: "🐔",
  wind: "💨",
  laughing: "😂",
  vacuum_cleaner: "🧹",
  church_bells: "🔔",
  insects: "🦟",
  pouring_water: "🚰",
  brushing_teeth: "🪥",
  clock_alarm: "⏰",
  airplane: "✈️",
  sheep: "🐑",
  toilet_flush: "🚽",
  snoring: "😴",
  clock_tick: "⏱️",
  fireworks: "🎆",
  crow: "🐦‍⬛",
  thunderstorm: "⛈️",
  drinking_sipping: "🥤",
  glass_breaking: "🔨",
  hand_saw: "🪚",
};

const getEmojiForClass = (className: string): string => {
  return ESC50_EMOJI_MAP[className] || "🔈";
};


interface Prediction{
  class: string;
  confidence: number;
}

interface LayerData{
  shape: number[];
  values: number[][];
}

interface VisualizationData {
  [layerName: string]: LayerData;
}

interface waveformData {
  values: number[];
  sample_rate: number;
  duration: number;
}

interface ApiResponse {
  predictions: Prediction[];
  visualization: VisualizationData;
  input_spectrogram: LayerData;
  waveform: waveformData;
}

function splitLayers (visualization: VisualizationData){
  const main:[string, LayerData][] = [];
  const internals: Record<string,[string, LayerData][]> = {};
  for (const [name, data] of  Object.entries(visualization)){
    if(!name.includes(".")){
      main.push([name, data]);
    } else{
      const [parent] = name.split(".");
      if (parent === undefined) continue;
      if (!internals[parent] ) internals[parent] = [];
      internals[parent].push([name, data]); 
    }
  }
  return { main, internals };

}


export default function HomePage() {
  const[vizData, setVizData] = useState<ApiResponse | null>(null);
  const[isLoading, setIsLoading] = useState(false);
  const[fileName, setFileName] = useState("");
  const[error, setError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setIsLoading(true);
    setError(null);
    setVizData(null);

    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = async () => {
      try{
              const arrayBuffer = reader.result as ArrayBuffer;
      const base64String = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      const response = await fetch("https://moizlala--audio-cnn-inference-audioclassifier-inference.modal.run/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            audio_data: base64String,
          })
        }
      );

      if(!response.ok){
        throw new Error(`Api Error ${response.statusText}`);
      }

      const data: ApiResponse = await response.json();
      setVizData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred");

      } finally{
        setIsLoading(false);
      }


    };
    reader.onerror = () => {
      setError("Failed to read file. Please try again.");
      setIsLoading(false);
    }
  }

 const { main, internals } =
  vizData && vizData.visualization
    ? splitLayers(vizData.visualization)
    : { main: [], internals: {} };

  return (
    <main className=" min-h-screen bg-stone-50 p-8">
      <div className="mx-auto max-w-[60%] ">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-light tracking-tight text-stone-900">Audio Visualizer</h1>
          <p className="mb-8 text-lg text-stone-700">
            Upload an wav audio file and visualize its waveform and spectrogram.
          </p>
          <div className="flex flex-col items-center">
            <div className="relative inline-block">
              <input 
              type="file" 
              accept=".wav"
              onChange={handleFileChange} 
              id="file-upload"  
              disabled={isLoading} 
              className="absolute inset-0 w-full cursor-pointer opacity-0"/>
              <Button className="border-stone-300" variant="outline" size="lg">
                {isLoading ? "Processing..." : "Choose File"}
              </Button>

            </div>
            {fileName && (
              <Badge variant="secondary" className="mt-4 bg-stone-200 text-stone-700">{fileName}</Badge>
            )}

          </div>
          {error && (<Card className="mb-8 mt-4 border-red-200 bg-red-50 "><CardContent>
            <p className="text-red-600">Error : {error}</p>
            </CardContent></Card>)}

            { vizData && (<div className="space-y-8">
              <Card>
                <CardHeader>Top Predictions</CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {vizData.predictions.slice(0, 3).map((pred, i) => (
                     <div key={pred.class} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-md font-medium text-stone-800">
                        {getEmojiForClass(pred.class)}{" "}
                        <span>{pred.class.replaceAll("_"," ")}</span>
                        </div>
                        <Badge variant={i===0 ? "default" : "secondary"}>{(pred.confidence * 100).toFixed(1)}%</Badge>
                      </div>
                      <Progress value={pred.confidence * 100} className="h-2"/>
                     </div> 
                    ))}

                  </div>
                </CardContent>
              </Card>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader className="text-stone-900">Input Spectogram</CardHeader>
                  <CardContent>
                    <FeatureMap data={vizData.input_spectrogram.values} title={`${vizData.input_spectrogram.shape.join(" x ")}`}/>
                    <div className="mt-5 flex justify-end">
                      <ColorScale width={200} height={16} min={-1} max={1}/>
                    </div>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-stone-900">
                    Audio Waveform
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Waveform
                    data={vizData.waveform.values}
                    title={`${vizData.waveform.duration.toFixed(2)}s * ${vizData.waveform.sample_rate}Hz`}
                  />
                </CardContent>
              </Card>
              
              <Card>
              <CardHeader>
                <CardTitle>Convolutional Layer Outputs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-6">
                  {main.map(([mainName, mainData]) => (
                    <div key={mainName} className="space-y-4">
                      <div>
                        <h4 className="mb-2 font-medium text-stone-700">
                          {mainName}
                        </h4>
                        <FeatureMap
                          data={mainData.values}
                          title={`${mainData.shape.join(" x ")}`}
                        />
                      </div>

                      {internals[mainName] && (
                        <div className="h-80 overflow-y-auto rounded border border-stone-200 bg-stone-50 p-2">
                          <div className="space-y-2">
                            {internals[mainName]
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([layerName, layerData]) => (
                                <FeatureMap
                                  key={layerName}
                                  data={layerData.values}
                                  title={layerName.replace(`${mainName}.`, "")}
                                  internal={true}
                                />
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex justify-end">
                  <ColorScale width={200} height={16} min={-1} max={1} />
                </div>
              </CardContent>
            </Card>

              
            </div>
          )}
        </div>

      </div>
      
   
    </main>
  );
}

