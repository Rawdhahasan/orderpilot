import { PageHeader } from "@/components/layout/page-header";
import { PhaseNotice } from "@/components/states/phase-notice";
import { Card, CardContent } from "@/components/ui/card";

/** An honest placeholder for sections that later phases deliver. No sample data. */
export function ComingSoon({
  title,
  description,
  phase,
  feature,
}: {
  title: string;
  description: string;
  phase: string;
  feature: string;
}) {
  return (
    <div className="mx-auto max-w-[1440px] space-y-5">
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="pt-4">
          <PhaseNotice phase={phase} feature={feature} />
        </CardContent>
      </Card>
    </div>
  );
}
