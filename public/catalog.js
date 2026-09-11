// Shared catalog of subjects, classes, and schedule blocks.
// Loaded as a classic script; exposes window.__CATALOG__ so both the
// compat pages and the ES-module pages can use the same lists.
//
// IMPORTANT: class names here are the matching key between student requests
// (request.html) and tutor approvals (account.html / admin.html). Keep the
// student and tutor sides on this single list.
(function (global) {
  const subjects = {
    Math: [
      "Geometry",
      "Advanced Geometry",
      "Honors Geometry",
      "Algebra II",
      "Advanced Algebra II",
      "Honors Algebra II",
      "Precalculus",
      "Advanced Precalculus",
      "Honors Precalculus",
      "Calculus I",
      "Honors Calculus I",
      "Honors Calculus I & II",
      "Honors Calculus II",
      "Calc & Stats",
      "Linear Algebra",
      "Multivariable Calculus",
      "Other",
    ],
    Science: [
      "Chemistry",
      "Honors Chemistry I",
      "Honors Chemistry II",
      "Honors Organic Chemistry",
      "Human Anatomy & Physiology",
      "Genetics and Biotechnology",
      "Honors Molecular & Cellular Biology",
      "Honors Evolution & Ecology",
      "Astronomy",
      "Oceanography and Marine Biology",
      "Honors Geology",
      "Honors Environmental Science",
      "Physics I",
      "Honors Physics I",
      "Honors Physics II",
      "Honors Physics C: Mechanics",
      "Honors Physics C: Electricity & Magnetism",
      "Other",
    ],
    English: [
      "English II",
      "English III",
      "Honors English III",
      "Honors English Seminar",
      "Creative Writing",
      "Other",
    ],
    History: [
      "Rise of The Modern World",
      "ROTW Art History",
      "Thematic US History",
      "Honors US History",
      "Honors European History",
      "Honors Middle East Studies",
      "Other",
    ],
    "World Language": [
      "Latin II",
      "Latin III",
      "Honors Latin III",
      "Advanced Latin III",
      "Latin IV",
      "Honors Latin Lit I",
      "Honors Latin Lit II",
      "Chinese II",
      "Chinese III",
      "Honors Chinese III",
      "Advanced Chinese III",
      "Chinese IV",
      "Chinese V",
      "Honors Chinese Lang & Culture",
      "Honors Chinese Lit & Arts",
      "French II",
      "French III",
      "Honors French III",
      "Advanced French III",
      "French IV",
      "French V: Contemporary Culture and Communication",
      "Honors French Lang & Culture",
      "Honors French Lit & Arts",
      "Spanish II",
      "Spanish III",
      "Honors Spanish III",
      "Advanced Spanish III",
      "Spanish IV",
      "Spanish V: Interdisciplinary Spanish Studies",
      "Honors Spanish Lang & Culture",
      "Honors Spanish Lit & Arts",
      "Honors Spanish Seminar: History of Spain and Latin America",
      "Other",
    ],
    "Computer Science": [
      "Advanced Computer Science",
      "Design and Data Structures",
      "Other",
    ],
    Other: ["Other"],
  };

  // Block code -> friendly label (2026-27: classes are lettered A-G;
  // codes must match <PeriodCode> in the school's DailySchedulesUS.xml)
  const blocks = {
    A: "Block A",
    B: "Block B",
    C: "Block C",
    D: "Block D",
    E: "Block E",
    F: "Block F",
    G: "Block G",
    L: "Lunch",
    DS: "Directed Study",
    CC: "Co-Curricular (3:15-4:00)",
    M10: "Soph. Seminar",
    M11: "Junior Seminar",
    M12: "Senior Seminar",
    FC: "Faculty Collaboration",
    CT: "Community Time",
    OH: "Office Hours",
  };

  // Blocks that occur on each cycle day (Day 1..6), in schedule order,
  // per the 2026-27 schedule. The 15-minute Break (B1) is omitted.
  const dayBlocks = [
    ["A", "M12", "B", "L", "C", "DS", "CC"],
    ["D", "M10", "E", "L", "F", "G", "CC"],
    ["FC", "B", "L", "C", "A", "CC"],
    ["E", "OH", "F", "L", "G", "D", "CC"],
    ["C", "CT", "A", "L", "B", "DS", "CC"],
    ["F", "M11", "G", "L", "D", "E", "CC"],
  ];

  // Roles an admin can assign in the console
  const roles = [
    "student",
    "Admin",
    "Head",
    "Developer",
    ...Object.keys(subjects)
      .filter((s) => s !== "Other")
      .map((s) => s + " Lead"),
  ];

  function subjectOfClass(className) {
    for (const s of Object.keys(subjects)) {
      if (subjects[s].indexOf(className) >= 0) return s;
    }
    return null;
  }

  global.__CATALOG__ = { subjects, blocks, dayBlocks, roles, subjectOfClass };
})(window);
