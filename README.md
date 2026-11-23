# 拾光守护 · 流浪动物领养管理系统

领养人可以查看动物档案、收藏和比较动物、提交领养申请、参与社区讨论。工作人员可以审核申请、办理领养和回访，管理健康记录、捐赠和库存，以及创建加密备份。项目使用 React、Node.js 和 MySQL 8.4。

## 在 Mac 上运行

1. 下载 [项目 ZIP](https://github.com/Crimson227/shiguang-animal-shelter/archive/refs/heads/main.zip)，解压后将整个文件夹放在打算长期使用的位置。
2. **Apple 芯片的 Mac** 打开“终端”，有 Homebrew 时执行下面这行。尚未安装 Homebrew 可按[官网说明](https://brew.sh/zh-cn/)安装。

   ~~~sh
   brew install node@22 mysql@8.4
   ~~~

   **Intel 芯片的 Mac** 可安装 [Node.js 22](https://nodejs.org/en/download/archive/v22)（22.12 或以上）和 [MySQL Community Server 8.4](https://dev.mysql.com/downloads/mysql/8.4.html) 的 macOS x86_64 版本。启动文件会查找标准安装目录 /usr/local/mysql/bin，也支持通过 MYSQL_BIN 指定解压后的 bin 目录。

3. 打开“终端”，输入 **bash** 和一个空格，把解压文件夹里的 **start-mac.command** 拖进终端，按回车。首次运行需要联网安装依赖，并提示你给管理员 **admin** 设置密码，输入时屏幕上不会显示字符。
4. 等终端显示“领养大厅”后，浏览器会自动打开。保留终端窗口即可使用。

| 入口 | 本机地址 |
| --- | --- |
| 领养大厅 | http://127.0.0.1:27470/catalog |
| 管理后台 | http://127.0.0.1:27470/ |

**下次使用**，再次运行同一个启动文件。按 **Control+C** 可同时停止网页与项目数据库。项目使用独立的 MySQL 实例，数据库端口为 27472，已有的 MySQL 服务可以照常使用。

## 初始数据和本机文件

首次启动会建立 45 份示例动物档案，其中 36 只开放领养，另有 20 篇虚构社区帖子。示例照片和相册随源码提供，首次安装完成后可在本机浏览。

数据库、备份密钥和本机配置保存在 ~/Library/Application Support/ShiguangShelter/instance。运行期间新上传的动物和社区照片分别保存在项目的 server/imgs 和 server/community-photos。搬迁或更换项目文件夹前，可在管理后台创建并校验加密备份，并单独妥善保存本机密钥。

在线 AI 助手需要自行配置服务密钥。可参考 server/ai.example.json，在自己的电脑上创建 server/ai.local.json，或设置 SHELTER_AI_API_KEY、SHELTER_AI_BASE_URL 和 SHELTER_AI_MODEL。领养和后台管理可直接使用。

## 项目文件

- client/ 包含 React 前端和页面资源。
- server/ 包含服务端、资料管理、账号、社区、备份功能与示例图片。
- database/init.sql 包含初次安装时使用的基础表和虚构样本，后续表结构由服务端迁移程序更新。
- start-mac.command 用于 Mac 首次安装、日常启动和停止。已有本机数据库配置的 Windows 用户可沿用“启动系统.cmd”。
- 两类 Mac 的自动验证覆盖首次启动、浏览器打开领养档案、管理员登录、备份创建与校验，以及停止后再次启动。[查看 GitHub Actions 记录](https://github.com/Crimson227/shiguang-animal-shelter/actions/workflows/macos.yml)
