import { useState } from "react";
import { RouteFinder } from "@/components/RouteFinder";
import { useMapData } from "@/hooks/use-map-data";

const RoutePage = () => {
  const { data } = useMapData();
  const [source, setSource] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);

  return (
    <RouteFinder
      junctions={data?.junctions || []}
      source={source}
      destination={destination}
      onSourceChange={setSource}
      onDestinationChange={setDestination}
    />
  );
};

export default RoutePage;
