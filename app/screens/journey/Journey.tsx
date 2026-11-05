// C-298 (the user, 2026-11-05: "Currently goals is a top most tab. We should make something more general and within that
// tab there would be the section for goals as well as some new sections"): JOURNEY, where GOALS was -- its sections in a
// row, GOALS first (the one goal, its steps, WALKING) and the JOURNAL. A new section is one more pair in SECTIONS.
import { useState } from "react";
import { YStack } from "tamagui";
import { Segments } from "../../ui/ui";
import { GoalsScreen } from "./Goals";
import { JournalSection } from "./Journal";

const SECTIONS = [["goals", "GOALS"], ["journal", "JOURNAL"]] as const;   // DRAFT
type Section = (typeof SECTIONS)[number][0];
let kept: Section = "goals";                                             // the section you left, while the app is open

export function JourneyScreen({ reload, ink }: { reload: () => void; ink: string }) {
  const [section, setSection] = useState<Section>(kept);
  const pick = (s: Section) => { kept = s; setSection(s); };
  return (
    <YStack gap={14}>
      <Segments value={section} onChange={pick} options={SECTIONS.map(([v, l]) => [v, l] as [Section, string])} />
      {section === "goals" ? <GoalsScreen reload={reload} ink={ink} /> : <JournalSection ink={ink} />}
    </YStack>
  );
}
