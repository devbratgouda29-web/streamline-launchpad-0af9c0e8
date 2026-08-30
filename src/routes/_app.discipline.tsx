import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DisciplineGate } from "@/components/DisciplineGate";

export const Route = createFileRoute("/_app/discipline")({
  component: () => (
    <DisciplineGate>
      <Outlet />
    </DisciplineGate>
  ),
});
