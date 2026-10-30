import { class8BiologyMicrobesPaper } from "@/lib/server/class8-biology-microbes-paper";
import { class9PhysicsMotionPaper } from "@/lib/server/class9-physics-motion-paper";
import { class10BiologyControlCoordinationPaper } from "@/lib/server/class10-biology-control-coordination-paper";
import { class11BiologyClassificationPaper } from "@/lib/server/class11-biology-classification-paper";
import { class12BiologyReproductionPaper } from "@/lib/server/class12-biology-paper";

export const demoPaperCatalog = {
  "class-8": { title: "Class 8 Biology demo paper", subject: "Biology", chapter: "Microbes: Friend and Foe", questions: class8BiologyMicrobesPaper },
  "class-9": { title: "Class 9 Physics demo paper", subject: "Physics", chapter: "Motion", questions: class9PhysicsMotionPaper },
  "class-10-boys": { title: "Class 10 Biology demo paper", subject: "Biology", chapter: "Control and Coordination", questions: class10BiologyControlCoordinationPaper },
  "class-10-girls": { title: "Class 10 Biology demo paper", subject: "Biology", chapter: "Control and Coordination", questions: class10BiologyControlCoordinationPaper },
  "class-11": { title: "Class 11 Biology demo paper", subject: "Biology", chapter: "Biological Classification", questions: class11BiologyClassificationPaper },
  "class-12": { title: "Class 12 Biology demo paper", subject: "Biology", chapter: "Sexual Reproduction in Flowering Plants", questions: class12BiologyReproductionPaper },
} as const;

export type DemoPaperSlug = keyof typeof demoPaperCatalog;
export function getDemoPaper(slug: string) {
  return Object.hasOwn(demoPaperCatalog, slug) ? demoPaperCatalog[slug as DemoPaperSlug] : null;
}
