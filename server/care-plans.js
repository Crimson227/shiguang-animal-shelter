export const medicalPlans = `SELECT v.visitID,v.nextVisitDate,a.animalName
  FROM MedicalVisits v JOIN Animals a ON a.animalID=v.animalID
  WHERE v.visitID=(SELECT recent.visitID FROM MedicalVisits recent WHERE recent.animalID=v.animalID
    ORDER BY recent.visitDate DESC,recent.visitID DESC LIMIT 1)`;

export const followupPlans = `SELECT f.visitID,f.nextVisitDate,a.animalName,ap.applicationID,ap.patronID
  FROM FollowUpVisits f JOIN AdoptionApplications ap ON ap.applicationID=f.applicationID
  JOIN Animals a ON a.animalID=ap.animalID
  WHERE ap.status='completed' AND f.visitID=(SELECT recent.visitID FROM FollowUpVisits recent
    WHERE recent.applicationID=f.applicationID ORDER BY recent.visitDate DESC,recent.visitID DESC LIMIT 1)
  UNION ALL
  SELECT -ap.applicationID,ap.followUpDueDate,a.animalName,ap.applicationID,ap.patronID
  FROM AdoptionApplications ap JOIN Animals a ON a.animalID=ap.animalID
  WHERE ap.status='completed' AND NOT EXISTS(SELECT 1 FROM FollowUpVisits f WHERE f.applicationID=ap.applicationID)`;
