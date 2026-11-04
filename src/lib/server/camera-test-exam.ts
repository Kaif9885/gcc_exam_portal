import type { SchoolDb } from "@/lib/mongodb";

export const CAMERA_TEST_EXAM_ID = "camera-monitoring-test-exam";

export async function ensureCameraTestExam(db: SchoolDb) {
  const now = new Date();
  await Promise.all([
    db.collection("exams").updateOne(
      { _id: CAMERA_TEST_EXAM_ID },
      { $setOnInsert: {
        _id: CAMERA_TEST_EXAM_ID, id: CAMERA_TEST_EXAM_ID, title: "Camera Monitoring Test",
        subject: "Camera Test", chapter_name: "Live Monitoring", duration_seconds: 900,
        max_marks: 1, passing_marks: 0, published: true, created_at: now,
      } },
      { upsert: true },
    ),
    db.collection("questions").updateOne(
      { _id: "camera-monitoring-test-question" },
      { $setOnInsert: {
        _id: "camera-monitoring-test-question", id: "camera-monitoring-test-question",
        exam_id: CAMERA_TEST_EXAM_ID, body: "Camera test: select Continue to check that the test exam opens correctly.",
        position: 1, marks: 1,
      } },
      { upsert: true },
    ),
    db.collection("questionOptions").updateOne(
      { _id: "camera-monitoring-test-option-a" },
      { $setOnInsert: {
        _id: "camera-monitoring-test-option-a", id: "camera-monitoring-test-option-a",
        question_id: "camera-monitoring-test-question", option_label: "A", label: "A",
        body: "Continue the camera test", is_correct: true,
      } },
      { upsert: true },
    ),
    db.collection("questionOptions").updateOne(
      { _id: "camera-monitoring-test-option-b" },
      { $setOnInsert: {
        _id: "camera-monitoring-test-option-b", id: "camera-monitoring-test-option-b",
        question_id: "camera-monitoring-test-question", option_label: "B", label: "B",
        body: "End the camera test", is_correct: false,
      } },
      { upsert: true },
    ),
  ]);
}
