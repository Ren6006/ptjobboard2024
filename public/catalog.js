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

  // Block code -> friendly label
  const blocks = {
    1: "Block 1",
    M11: "Junior Seminar",
    2: "Block 2",
    L: "Lunch",
    3: "Block 3",
    DS: "DS",
    CC: "CC (3:15-4:00)",
    4: "Block 4",
    M10: "Soph. Seminar",
    5: "Block 5",
    6: "Block 6",
    7: "Block 7",
    FC: "Faculty Collaboration",
    M12: "Senior Seminar",
    CT: "Community Time",
    OH: "Office Hours",
  };

  // Blocks that occur on each cycle day (Day 1..6), in schedule order.
  const dayBlocks = [
    ["1", "M11", "2", "L", "3", "DS", "CC"],
    ["4", "M10", "5", "L", "6", "7", "CC"],
    ["FC", "2", "L", "3", "1", "CC"],
    ["5", "M12", "6", "L", "7", "4", "CC"],
    ["3", "CT", "1", "L", "2", "DS", "CC"],
    ["6", "OH", "7", "L", "4", "5", "CC"],
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
