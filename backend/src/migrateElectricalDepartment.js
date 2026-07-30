import { connectDb, disconnectDb } from './config/db.js';
import { ACADEMIC_STREAMS } from './constants/academicStreams.js';
import { Course } from './models/Course.js';
import { Department } from './models/Department.js';
import { User } from './models/User.js';

const canonical = { code: 'ECE', name: 'Electrical and Computer Engineering' };

await connectDb();

try {
  const legacy = await Department.findOne({
    $or: [
      { code: { $regex: '^EE$', $options: 'i' } },
      { name: { $regex: '^Electrical Engineering$', $options: 'i' } }
    ]
  });
  let ece = await Department.findOne({ code: canonical.code });

  if (!legacy) {
    if (ece && ece.name !== canonical.name) {
      ece.name = canonical.name;
      await ece.save();
    }
    console.log(ece ? 'ECE department is already canonical.' : 'No EE or ECE department was found.');
  } else if (!ece || legacy.id === ece.id) {
    legacy.code = canonical.code;
    legacy.name = canonical.name;
    await legacy.save();
    ece = legacy;
    console.log('Renamed the EE department to ECE.');
  } else {
    const collections = await Department.db.db.listCollections({}, { nameOnly: true }).toArray();
    for (const { name } of collections) {
      if (name === Department.collection.name) continue;
      await Department.db.db.collection(name).updateMany(
        { department: legacy._id },
        { $set: { department: ece._id } }
      );
    }
    if (!ece.hod && legacy.hod) ece.hod = legacy.hod;
    ece.name = canonical.name;
    await ece.save();
    await Department.deleteOne({ _id: legacy._id });
    console.log('Merged the EE department into ECE and removed the obsolete EE record.');
  }

  if (ece) {
    const legacyDemoProfiles = [
      ['student.marta.ee@mtu.edu.et', { email: 'student.marta.ece@mtu.edu.et', username: 'student.marta.ece', studentNumber: 'STU-ECE-001', yearLevel: 2 }],
      ['student.eyob.ee@mtu.edu.et', { email: 'student.eyob.ece@mtu.edu.et', username: 'student.eyob.ece', studentNumber: 'STU-ECE-002', yearLevel: 2 }],
      ['committee.engineering@mtu.edu.et', { academicStream: ACADEMIC_STREAMS[1] }],
      ['instructor.meron.ee@mtu.edu.et', { email: 'instructor.meron.ece@mtu.edu.et', username: 'instructor.meron.ece', employeeNumber: 'INS-ECE-101', academicStream: ACADEMIC_STREAMS[0] }],
      ['instructor.yonas.ee@mtu.edu.et', { email: 'instructor.yonas.ece@mtu.edu.et', username: 'instructor.yonas.ece', employeeNumber: 'INS-ECE-102', academicStream: ACADEMIC_STREAMS[2] }]
    ];
    for (const [email, profile] of legacyDemoProfiles) {
      await User.updateOne({ email, department: ece._id }, { $set: profile });
    }

    const legacyCourseCodes = new Map([['EE201', 'ECE211'], ['EE310', 'ECE310']]);
    const legacyCourses = await Course.find({ department: ece._id, code: { $in: [...legacyCourseCodes.keys()] } });
    for (const course of legacyCourses) {
      const code = legacyCourseCodes.get(course.code);
      const conflict = await Course.exists({ _id: { $ne: course._id }, semester: course.semester, code });
      if (!conflict) await Course.updateOne({ _id: course._id }, { $set: { code } });
    }
  }
} finally {
  await disconnectDb();
}
