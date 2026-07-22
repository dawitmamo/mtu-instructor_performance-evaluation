export const academicStreams = [
  ['ELECTRONICS_COMMUNICATION_ENGINEERING', 'Electronics Communication Engineering'],
  ['COMPUTER_ENGINEERING', 'Computer Engineering'],
  ['POWER_ENGINEERING', 'Power Engineering'],
  ['CONTROL_ENGINEERING', 'Control Engineering']
];

const streamNames = new Map(academicStreams);

export function streamLabel(stream) {
  return streamNames.get(stream) || 'General program';
}

export function studentGroupLabel(student) {
  const year = student.yearLevel ? `Year ${student.yearLevel}` : 'Year not specified';
  return student.yearLevel >= 4 ? `${year} / ${streamLabel(student.academicStream)}` : year;
}

export function groupStudents(students) {
  const groups = new Map();
  [...students]
    .sort((first, second) => (first.yearLevel || 99) - (second.yearLevel || 99) || streamLabel(first.academicStream).localeCompare(streamLabel(second.academicStream)) || `${first.firstName} ${first.lastName}`.localeCompare(`${second.firstName} ${second.lastName}`))
    .forEach((student) => {
      const label = studentGroupLabel(student);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(student);
    });
  return [...groups];
}
