import { pool } from './db.js';

// One-time, opt-in enrichment for the course project's existing sample animal records.
// Running it again preserves information that staff have already entered.
const dogDescriptions = [
  '喜欢与人互动，适合能安排规律散步和陪伴的家庭。初到新环境时建议循序建立作息。',
  '对周围事物保持好奇，愿意接受简单训练。需要稳定的日常活动和耐心引导。',
  '性格亲人，喜欢户外活动。适合有固定散步时间和安全居住空间的家庭。',
  '与熟悉的人相处放松，适合以温和方式建立信任和生活习惯。',
  '活泼而愿意亲近人，需要适量运动、互动游戏和稳定的照护安排。',
];
const catDescriptions = [
  '喜欢在安静的地方观察环境，熟悉后愿意亲近人。建议准备安全的室内活动空间。',
  '性格温和，适合节奏稳定的家庭。需要猫抓板、躲藏处和固定的日常陪伴。',
  '对新环境有探索欲，建议先提供独立适应空间，再逐步扩大活动范围。',
  '喜欢舒适的休息角落和规律的互动。领养前请做好门窗防护。',
  '愿意与人相处，也需要保留独处空间。适合安静、稳定的室内环境。',
];
const observed = new Set([5, 10, 18, 25, 33, 41]);
const treated = new Set([14, 15]);
const assessment = {
  '健康': '入所档案评估：精神、食欲及活动情况稳定，按计划进行常规复查。',
  '需观察': '入所档案评估：需要持续观察饮食、活动及新环境适应情况。',
  '治疗中': '入所档案评估：存在需要持续诊疗的情况，按复诊计划照护。',
};

const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  const [animals] = await connection.execute('SELECT animalID,animalName,species,intakeDate,description,healthStatus,healthNotes FROM Animals WHERE animalID<=46 ORDER BY animalID FOR UPDATE');
  let enriched = 0;
  for (const animal of animals) {
    const id = Number(animal.animalID);
    const intakeDate = new Date(Date.UTC(2025, 0, 1 + id * 14)).toISOString().slice(0, 10);
    const variants = animal.species === 'Feline' ? catDescriptions : dogDescriptions;
    const description = `${animal.animalName}：${variants[id % variants.length]}`;
    const status = treated.has(id) ? '治疗中' : observed.has(id) ? '需观察' : '健康';
    const shouldAssess = animal.healthStatus === '待评估';
    await connection.execute(`UPDATE Animals SET intakeDate=COALESCE(intakeDate,?),description=COALESCE(NULLIF(description,''),?),
      healthNotes=CASE WHEN healthStatus='待评估' THEN ? ELSE healthNotes END,
      healthStatus=CASE WHEN healthStatus='待评估' THEN ? ELSE healthStatus END WHERE animalID=?`,
    [intakeDate, description, assessment[status], status, id]);
    if (shouldAssess) {
      await connection.execute('INSERT INTO AnimalHealthHistory(animalID,oldStatus,newStatus,note) VALUES(?,?,?,?)',
        [id, '待评估', status, assessment[status]]);
    }
    enriched++;
  }
  await connection.commit();
  console.log(`已整理 ${enriched} 份课程样例动物档案。`);
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
