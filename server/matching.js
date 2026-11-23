import { query } from './db.js';

export async function recommendForPatron(patronID) {
  return query(`SELECT a.animalID,a.animalName,a.species,a.breed,a.age,a.size,a.pictureURL,a.healthStatus,
    (
      CASE WHEN pref.preferredSpecies IS NULL OR pref.preferredSpecies='' THEN 20 WHEN a.species=pref.preferredSpecies THEN 40 ELSE 0 END +
      CASE WHEN pref.preferredSize IS NULL OR pref.preferredSize='' THEN 12 WHEN a.size=pref.preferredSize THEN 25 ELSE 0 END +
      CASE WHEN pref.minAge IS NULL AND pref.maxAge IS NULL THEN 10
        WHEN CAST(a.age AS UNSIGNED) >= COALESCE(pref.minAge,0) AND CAST(a.age AS UNSIGNED) <= COALESCE(pref.maxAge,50) THEN 20 ELSE 0 END +
      CASE WHEN a.healthStatus='健康' THEN 15 WHEN a.healthStatus='待评估' THEN 5
        WHEN COALESCE(pref.acceptsSpecialCare,0)=1 THEN 15 ELSE 0 END
    ) AS matchScore,
    CONCAT_WS(' · ',
      CASE WHEN pref.preferredSpecies IS NULL OR pref.preferredSpecies='' THEN '种类不限' WHEN a.species=pref.preferredSpecies THEN '种类符合偏好' ELSE NULL END,
      CASE WHEN pref.preferredSize IS NULL OR pref.preferredSize='' THEN '体型不限' WHEN a.size=pref.preferredSize THEN '体型符合偏好' ELSE NULL END,
      CASE WHEN pref.minAge IS NULL AND pref.maxAge IS NULL THEN '年龄不限'
        WHEN CAST(a.age AS UNSIGNED) >= COALESCE(pref.minAge,0) AND CAST(a.age AS UNSIGNED) <= COALESCE(pref.maxAge,50) THEN '年龄符合偏好' ELSE NULL END,
      CASE WHEN a.healthStatus='健康' THEN '健康状态良好' WHEN a.healthStatus='待评估' THEN '健康待评估' ELSE '需要特别照护' END
    ) AS matchReason
    FROM Patrons p
    CROSS JOIN Adoptable d
    JOIN Animals a ON a.animalID=d.animalID
    LEFT JOIN PatronPreferences pref ON pref.patronID=p.patronID
    WHERE p.patronID=?
    AND NOT EXISTS (SELECT 1 FROM FostersAndAdoptions f WHERE f.animalID=a.animalID)
    AND NOT EXISTS (SELECT 1 FROM FosterRecords f WHERE f.animalID=a.animalID AND f.status='active')
    AND NOT EXISTS (SELECT 1 FROM AdoptionApplications ap WHERE ap.animalID=a.animalID AND ap.status IN ('approved','completed'))
    AND (a.healthStatus IN ('健康','待评估') OR COALESCE(pref.acceptsSpecialCare,0)=1)
    ORDER BY matchScore DESC,a.animalID DESC LIMIT 8`, [patronID]);
}
