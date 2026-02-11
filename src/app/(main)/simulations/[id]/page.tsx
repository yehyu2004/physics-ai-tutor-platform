import SimulationViewClient from "./SimulationViewClient";

export default async function SimulationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SimulationViewClient simulationId={id} />;
}
