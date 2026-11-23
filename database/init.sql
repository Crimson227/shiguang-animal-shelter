-- 为拾光守护的新数据库建立表和虚构示例数据。
-- ==========================================
-- 1. 基础表结构
-- ==========================================
CREATE TABLE `Animals` (
    `animalID` int NOT NULL AUTO_INCREMENT,
    `species` varchar(10),
    `animalName` varchar(20) NOT NULL,
    `age` varchar(10) NOT NULL,
    `gender` varchar(1),
    `breed` varchar(20),
    `size` varchar(10) DEFAULT '中型',
    `pictureURL` varchar(256),
    PRIMARY KEY (`animalID`)
);

CREATE TABLE `Vaccines` (
    `vaccineID` int NOT NULL AUTO_INCREMENT,
    `name` varchar(50) UNIQUE NOT NULL,
    `doses` int,
    `species` varchar(20),
    PRIMARY KEY (`vaccineID`)
);

CREATE TABLE `VaccinesAdministered` (
    `animalID` int NOT NULL,
    `vaccineName` varchar(50),
    `vaccineID` int,
    `dateGiven` date,
    `dateExpires` date,
    PRIMARY KEY (`animalID`, `vaccineName`),
    FOREIGN KEY (`animalID`) REFERENCES Animals(animalID) ON DELETE CASCADE,
    FOREIGN KEY (`vaccineID`) REFERENCES Vaccines(vaccineID) ON DELETE SET NULL
);

CREATE TABLE `Prescriptions` (
    `animalID` int NOT NULL,
    `name` varchar(20),
    `frequency` varchar(255),
    PRIMARY KEY (`animalID`, `name`),
    FOREIGN KEY (`animalID`) REFERENCES Animals(`animalID`) ON DELETE CASCADE
);

CREATE TABLE `Patrons` (
    `patronID` int NOT NULL AUTO_INCREMENT,
    `firstName` varchar(15),
    `lastName` varchar(15),
    `phoneNumber` varchar(12),
    `address` varchar(50),
    `totalDonated` DECIMAL(10,2) DEFAULT 0,
    `patronLevel` VARCHAR(20) DEFAULT '普通会员',
    PRIMARY KEY (`patronID`)
);

CREATE TABLE `PatronPreferences` (
    `preferenceID` int NOT NULL AUTO_INCREMENT,
    `patronID` int,
    `preferredSpecies` varchar(10),
    `preferredSize` varchar(10),
    `minAge` int,
    `maxAge` int,
    PRIMARY KEY (`preferenceID`),
    FOREIGN KEY (`patronID`) REFERENCES Patrons(patronID) ON DELETE CASCADE
);

CREATE TABLE `FostersAndAdoptions` (
    `animalID` int NOT NULL,
    `patronID` int,
    `fosteredOrAdopted` varchar(1),
    `date` date,
    PRIMARY KEY (`animalID`),
    FOREIGN KEY (`animalID`) REFERENCES Animals(animalID) ON DELETE CASCADE,
    FOREIGN KEY (`patronID`) REFERENCES Patrons(patronID)
);

CREATE TABLE `Adoptable` (
    `animalID` int NOT NULL,
    `restrictions` text,
    PRIMARY KEY (`animalID`),
    FOREIGN KEY (`animalID`) REFERENCES Animals(animalID) ON DELETE CASCADE
);

CREATE TABLE Donations (
    donationID int NOT NULL AUTO_INCREMENT,
    patronID int,
    amount DECIMAL(10,2),
    donationDate DATE,
    note TEXT,
    PRIMARY KEY (donationID),
    CONSTRAINT fk_donations_patron_history FOREIGN KEY (patronID) REFERENCES Patrons(patronID) ON DELETE RESTRICT
);

CREATE TABLE Inventory (
    itemID int NOT NULL AUTO_INCREMENT,
    itemName varchar(50) NOT NULL,
    category varchar(30),
    quantity int,
    unit varchar(10),
    PRIMARY KEY (itemID)
);

-- ==========================================
-- 2. 核心功能：触发器与存储过程
-- ==========================================

DELIMITER //

-- 触发器1：领养后自动移除待领养状态
CREATE TRIGGER After_Adoption_Insert
AFTER INSERT ON FostersAndAdoptions
FOR EACH ROW
BEGIN
    IF NEW.fosteredOrAdopted = 'A' THEN
        DELETE FROM Adoptable WHERE animalID = NEW.animalID;
    END IF;
END;
//

-- 触发器2：捐赠后自动升级会员等级 (VIP系统)
CREATE TRIGGER After_Donation_Update_Patron
AFTER INSERT ON Donations
FOR EACH ROW
BEGIN
    UPDATE Patrons
    SET totalDonated = (SELECT SUM(amount) FROM Donations WHERE patronID = NEW.patronID)
    WHERE patronID = NEW.patronID;

    UPDATE Patrons
    SET patronLevel = CASE
        WHEN totalDonated >= 1000 THEN '黄金会员'
        WHEN totalDonated >= 200 THEN '白银会员'
        ELSE '普通会员'
    END
    WHERE patronID = NEW.patronID;
END;
//

-- 存储过程1：智能匹配算法
CREATE PROCEDURE CalculateMatchScore(IN targetPatronID INT)
BEGIN
    SELECT
        A.animalID,
        A.animalName,
        A.species,
        A.breed,
        A.pictureURL,
        (
            (CASE WHEN A.species = P.preferredSpecies THEN 50 ELSE 0 END) +
            (CASE WHEN A.size = P.preferredSize THEN 30 ELSE 0 END) +
            (CASE WHEN A.age BETWEEN P.minAge AND P.maxAge THEN 20 ELSE 5 END)
        ) AS matchScore
    FROM Animals A
    JOIN PatronPreferences P ON P.patronID = targetPatronID
    WHERE A.animalID NOT IN (SELECT animalID FROM FostersAndAdoptions)
    ORDER BY matchScore DESC
    LIMIT 5;
END;
//

-- 存储过程2：疫苗历史查询
CREATE PROCEDURE GetAnimalVaccineHistory(IN target_animal_id INT)
BEGIN
    SELECT
        A.animalName AS '动物名称',
        V.vaccineName AS '疫苗名称',
        V.dateGiven AS '接种日期',
        V.dateExpires AS '过期日期'
    FROM VaccinesAdministered V
    JOIN Animals A ON V.animalID = A.animalID
    WHERE A.animalID = target_animal_id;
END;
//
DELIMITER ;

INSERT INTO Animals (animalID, species, animalName, age, gender, breed, size, pictureURL) VALUES
  (1, 'Canine', '旺财', '3', 'M', '斗牛梗', '中型', 'imgs/animals/existing-1.jpg'),
  (2, 'Canine', '乐乐', '2', 'M', '比格犬', '中型', 'imgs/animals/existing-2.jpg'),
  (3, 'Feline', '不爽猫', '12', 'F', '三花猫', '小型', 'imgs/animals/existing-3.jpg'),
  (4, 'Feline', '煤球', '6', 'M', '暹罗猫', '小型', 'imgs/animals/existing-4.jpg'),
  (5, 'Canine', '史酷比', '4', 'M', '大丹犬', '大型', 'imgs/animals/existing-5.jpg'),
  (6, 'Canine', '豆豆', '1', 'F', '泰迪', '小型', 'imgs/animals/existing-6.jpg'),
  (7, 'Feline', '咪咪', '2', 'F', '狸花猫', '小型', 'imgs/animals/existing-7.jpg'),
  (8, 'Canine', '大黄', '5', 'M', '中华田园犬', '中型', 'imgs/animals/existing-8.jpg'),
  (9, 'Canine', '不仅', '3', 'F', '哈士奇', '大型', 'imgs/animals/existing-9.jpg'),
  (10, 'Feline', '小白', '1', 'M', '波斯猫', '小型', 'imgs/animals/existing-10.jpg'),
  (11, 'Canine', '雪球', '4', 'F', '萨摩耶', '大型', 'imgs/animals/existing-11.jpg'),
  (12, 'Canine', '黑豹', '2', 'M', '拉布拉多', '大型', 'imgs/animals/existing-12.jpg'),
  (13, 'Feline', '加菲', '5', 'M', '异国短毛猫', '小型', 'imgs/animals/existing-13.jpg'),
  (14, 'Feline', '奥利奥', '3', 'F', '奶牛猫', '小型', 'imgs/animals/existing-14.jpg'),
  (15, 'Canine', '可乐', '1', 'M', '柯基', '小型', 'imgs/animals/existing-15.jpg'),
  (16, 'Canine', '阿福', '3', 'M', '拉布拉多', '大型', 'imgs/animals/demo-dog-01.jpg'),
  (17, 'Canine', '麦兜', '2', 'F', '比格犬', '中型', 'imgs/animals/demo-dog-02.jpg'),
  (18, 'Canine', '福宝', '1', 'M', '巴哥犬', '小型', 'imgs/animals/demo-dog-03.jpg'),
  (19, 'Canine', '点点', '4', 'F', '斑点狗', '大型', 'imgs/animals/demo-dog-04.jpg'),
  (20, 'Canine', '虎子', '3', 'M', '拳师犬', '大型', 'imgs/animals/demo-dog-05.jpg'),
  (21, 'Canine', '小米', '2', 'F', '吉娃娃', '小型', 'imgs/animals/demo-dog-06.jpg'),
  (22, 'Canine', '星仔', '1', 'M', '哈士奇', '大型', 'imgs/animals/demo-dog-07.jpg'),
  (23, 'Canine', '柚子', '4', 'F', '贵宾犬', '中型', 'imgs/animals/demo-dog-08.jpg'),
  (24, 'Canine', '棉花', '2', 'F', '萨摩耶', '大型', 'imgs/animals/demo-dog-09.jpg'),
  (25, 'Canine', '元宝', '3', 'M', '柴犬', '中型', 'imgs/animals/demo-dog-10.jpg'),
  (26, 'Canine', '闪电', '5', 'M', '惠比特犬', '中型', 'imgs/animals/demo-dog-11.jpg'),
  (27, 'Canine', '蝴蝶', '2', 'F', '蝴蝶犬', '小型', 'imgs/animals/editorial-20261022/27-cover.webp'),
  (28, 'Feline', '奶糖', '2', 'F', '家猫', '小型', 'imgs/animals/demo-cat-01.jpg'),
  (29, 'Feline', '芝麻', '1', 'M', '家猫', '小型', 'imgs/animals/demo-cat-02.jpg'),
  (30, 'Feline', '团子', '3', 'F', '家猫', '小型', 'imgs/animals/demo-cat-03.jpg'),
  (31, 'Feline', '栗子', '2', 'M', '家猫', '小型', 'imgs/animals/demo-cat-04.jpg'),
  (32, 'Feline', '云朵', '4', 'F', '家猫', '小型', 'imgs/animals/demo-cat-05.jpg'),
  (33, 'Feline', '布丁', '1', 'F', '家猫', '小型', 'imgs/animals/demo-cat-06.jpg'),
  (34, 'Feline', '蓝莓', '5', 'M', '家猫', '小型', 'imgs/animals/demo-cat-07.jpg'),
  (35, 'Feline', '糯米', '2', 'F', '家猫', '小型', 'imgs/animals/demo-cat-08.jpg'),
  (36, 'Feline', '泡芙', '3', 'M', '家猫', '小型', 'imgs/animals/demo-cat-09.jpg'),
  (37, 'Feline', '可可', '1', 'F', '家猫', '小型', 'imgs/animals/demo-cat-10.jpg'),
  (38, 'Feline', '月牙', '4', 'M', '家猫', '小型', 'imgs/animals/demo-cat-11.jpg'),
  (39, 'Feline', '薄荷', '2', 'F', '家猫', '小型', 'imgs/animals/demo-cat-12.jpg'),
  (41, 'Canine', '山竹', '2', 'M', '博美犬', '小型', 'imgs/animals/editorial-20261022/41-cover.webp'),
  (42, 'Canine', '阿洛', '3', 'M', '阿拉斯加犬', '大型', 'imgs/animals/demo-dog-14.jpg'),
  (43, 'Feline', '松果', '3', 'M', '家猫', '小型', 'imgs/animals/demo-cat-13.jpg'),
  (44, 'Feline', '琥珀', '2', 'F', '家猫', '小型', 'imgs/animals/editorial-20261022/44-cover.webp'),
  (45, 'Feline', '小鹿', '1', 'F', '家猫', '小型', 'imgs/animals/editorial-20261022/45-cover.webp'),
  (46, 'Canine', '团团', '2', 'M', '混种犬', '中型', 'imgs/animals/tuantuan.png');

INSERT INTO Patrons (patronID, firstName, lastName) VALUES
  (1, '01', '示例'),
  (2, '02', '示例'),
  (3, '03', '示例'),
  (4, '04', '示例'),
  (5, '05', '示例'),
  (6, '06', '示例'),
  (7, '07', '示例'),
  (8, '08', '示例'),
  (9, '09', '示例'),
  (10, '10', '示例'),
  (11, '11', '示例'),
  (12, '12', '示例');

INSERT INTO PatronPreferences (patronID, preferredSpecies, preferredSize, minAge, maxAge) VALUES
(1, 'Canine', '大型', 1, 5),
(2, 'Feline', '小型', 0, 3),
(3, 'Canine', '中型', 2, 8),
(5, 'Feline', '小型', 5, 15),
(11, 'Canine', '小型', 0, 2);

INSERT INTO Vaccines (name, doses, species) VALUES
('狂犬疫苗2025版', 150, 'D'), ('猫三联Pro', 130, 'C'), ('八联疫苗', 80, 'D'), ('弓形虫疫苗', 45, 'C');

INSERT INTO Donations (patronID, amount, donationDate, note) VALUES
(1, 1000.00, '2025-01-15', '新年大额捐赠'),
(3, 300.00, '2025-02-10', '医疗专款'),
(5, 5000.00, '2025-03-01', '基地扩建基金'),
(2, 50.00, '2025-03-15', '零花钱'),
(11, 1200.00, '2025-04-05', '企业赞助'),
(8, 200.00, '2025-04-20', '义卖所得'),
(10, 800.00, '2025-05-01', '劳动节献爱心'),
(7, 100.00, '2025-05-15', '月捐');

INSERT INTO Inventory (itemName, category, quantity, unit) VALUES
('皇加密封猫粮', '食物', 50, '袋'),
('处方罐头', '食物', 120, '罐'),
('宠物专用消毒液', '清洁', 80, '瓶'),
('吸尘器滤芯', '清洁', 20, '盒'),
('伊丽莎白圈', '医疗', 35, '个'),
('一次性手套', '医疗', 200, '双'),
('大型犬笼', '其他', 10, '个'),
('猫爬架', '其他', 5, '套');

INSERT INTO VaccinesAdministered(animalID, vaccineID, vaccineName, dateGiven, dateExpires) VALUES
(1, 1, '狂犬疫苗2025版', '2025-01-10', '2026-01-10'),
(2, 3, '八联疫苗', '2025-02-05', '2026-02-05'),
(3, 2, '猫三联Pro', '2025-03-01', '2026-03-01'),
(11, 1, '狂犬疫苗2025版', '2025-04-12', '2026-04-12');

INSERT INTO FostersAndAdoptions(animalID, patronID, fosteredOrAdopted, date) VALUES
(1, 3, 'F', '2025-01-20'),
(4, 5, 'A', '2025-03-10'),
(12, 11, 'A', '2025-05-02');

INSERT INTO FostersAndAdoptions (animalID, patronID, fosteredOrAdopted, date) VALUES
  (16, 4, 'A', '2026-01-15'),
  (46, 8, 'A', '2026-05-12');

INSERT INTO Adoptable (animalID, restrictions) VALUES
  (2, '比格犬嗅闻需求较高，外出请使用牵引绳，并预留充足的散步时间。'),
  (3, '适合安静的室内家庭。准备低矮、易到达的休息和饮水位置，并关注老年猫的日常状态。'),
  (5, '需要足够的室内活动空间和稳定的散步安排。领养前请核对近期健康观察记录与后续复查计划。'),
  (6, '请预留定期梳毛和美容时间，并用短时、重复的练习帮助它适应护理。'),
  (7, '先提供独立适应房间，不要强行抱出躲藏处；门窗需做好防护。'),
  (8, '更适合能坚持规律散步、愿意用正向方式训练的家庭；不要把它当作长期独自看院的犬只。'),
  (9, '每天需要充分运动和互动游戏；请先确认居住空间、牵引管理和陪伴时间都能长期落实。'),
  (10, '准备安静的独立空间，领养前请与工作人员核对近期观察结果和复查安排。'),
  (17, '请安排有牵引管理的嗅闻散步，并用短时训练帮助它建立室内规则。'),
  (18, '准备通风、安静的休息位置；领养前确认健康观察记录和后续复查时间。'),
  (19, '每天预留较充足的户外活动时间，并提供可消耗精力的互动玩具。'),
  (20, '初期选择安静的散步路线，循序练习牵引与基础口令。'),
  (21, '给它固定的休息区，避免突然围抱；外出仍需安全牵引。'),
  (22, '大型犬活动需求较高，领养前请确认运动时间、室内空间与防走失措施。'),
  (23, '适合能维持规律作息的家庭；毛发护理和散步都需纳入每周安排。'),
  (24, '安排适度运动、充足饮水与凉爽的休息空间，并预留定期梳毛时间。'),
  (25, '建议有耐心进行基础训练的家庭；领养前核对近期健康记录及复查计划。'),
  (26, '提供安全的跑动机会，外出保持牵引，先练好召回和等待。'),
  (27, '安排适量散步和毛发护理，避免因为体型小而省略牵引与基础训练。'),
  (28, '准备可躲藏的独立适应区，减少初期访客，并做好门窗防护。'),
  (29, '提供猫爬架和安静的休息位置，互动时尊重它主动离开的信号。'),
  (30, '先以一间安静房间为适应区，确认进食和如厕稳定后再开放更多空间。'),
  (31, '准备固定的喂食、饮水和猫砂位置，避免频繁改变房间布置。'),
  (32, '做好窗户和阳台防护，提供高处观察点，并让它自行决定接近人的节奏。'),
  (33, '准备独立适应区；请在办理前核对健康观察结果和后续复查安排。'),
  (34, '适合安静的室内家庭，提供可躲藏的休息处，不强迫与访客互动。'),
  (35, '保持喂食时间稳定，准备猫抓板和简短的日常互动。'),
  (36, '初期减少嘈杂活动，保留躲藏处，用玩具而不是强行抱起建立互动。'),
  (37, '做好易开窗和阳台防护，提供安全玩具及稳定的休息区域。'),
  (38, '保持日常护理动作轻柔，准备固定的猫砂、饮水和休息位置。'),
  (39, '领养初期提供独立房间和藏身处，等它主动探索后再扩大活动范围。'),
  (41, '提供稳定陪伴与短时散步；领养前请核对近期健康观察和复查安排。'),
  (42, '请确认居住空间能容纳大型犬，并安排规律散步、牵引训练与夏季降温。'),
  (43, '准备安静的休息区与固定喂食时间，适应期避免频繁更换房间。'),
  (44, '先布置猫爬架和藏身处，减少突然的噪声，并做好门窗防护。'),
  (45, '准备安全玩具、猫抓板和独立适应区，避免让幼猫接触未防护的窗户。');
