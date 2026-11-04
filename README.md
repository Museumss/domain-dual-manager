# 双功能域名管理系统

一个基于 Cloudflare Pages Functions + D1 的双功能域名管理面板：
- 域名跳转：将已绑定并登记的域名 302 跳转到指定 HTTPS/HTTP 目标。
- 域名直连落地页：已登记域名展示独立落地页和明确的目标链接。
- 深色中文管理后台、单管理员登录、域名增删改查、启用/停用。
- 不包含短链接功能。

> “防红”不代表能够绕过微信、浏览器、搜索引擎或安全厂商的风险检测。本项目不提供伪装、隐藏目标、反检测或规避安全拦截功能。域名是否被拦截由相关平台独立决定。

## 项目文件
- `public/`：网站后台界面
- `functions/_middleware.js`：域名访问与 API 处理
- `schema.sql`：D1 数据库初始化
- `_routes.json`：让 Pages Functions 接管请求
- `wrangler.toml.example`：本地/绑定参考（无需本地命令）
- `.github/workflows/deploy.yml`：GitHub Actions 自动部署

## 全程网页部署（不使用终端）

### A. 创建 GitHub 仓库并上传文件
1. 登录 https://github.com/ ，点击右上角 `+` → `New repository`。
2. 仓库名填写 `domain-dual-manager`，选择 `Private`，点击 `Create repository`。
3. 在仓库页面点击 `Add file` → `Upload files`。
4. 将本项目 ZIP 解压到电脑，在上传页面把解压后的**文件和文件夹内容**拖进去（不要只上传 ZIP 文件）。
5. 等待上传完成，点击 `Commit changes`。

### B. 创建 Cloudflare D1 数据库
1. 登录 https://dash.cloudflare.com/ ，进入 `Workers & Pages` → `D1 SQL Database`（部分界面位于 `Storage & databases` → `D1`）。
2. 点击 `Create`，数据库名称填写 `domain-manager-db`，创建。
3. 打开数据库的 `Console` / `Query` 页面。
4. 打开 GitHub 仓库中的 `schema.sql`，复制全部内容，粘贴到 D1 Console 执行。
5. 在数据库详情页记录 Database ID（后面绑定时选择数据库即可）。

### C. 创建 Cloudflare Pages 项目
1. Cloudflare 控制台进入 `Workers & Pages` → `Create` → `Pages` → `Connect to Git`。
2. 授权 GitHub，选择 `domain-dual-manager` 仓库。
3. Framework preset 选择 `None`。
4. Build command 留空；Build output directory 填 `public`。
5. 点击 `Save and Deploy`。部署成功后会获得 `https://项目名.pages.dev` 测试地址。

### D. 绑定 D1 数据库
1. 打开刚创建的 Pages 项目 → `Settings` → `Functions` → `D1 database bindings`。
2. 点击 `Add binding`。
3. Variable name 必须填写 `DB`；D1 database 选择 `domain-manager-db`。
4. 保存后进入 `Deployments`，对最新部署执行 `Retry deployment` / `Redeploy`，使绑定生效。

### E. 设置管理员密码与会话密钥
1. Pages 项目 → `Settings` → `Environment variables`。
2. 在 Production 环境添加：
   - `ADMIN_PASSWORD`：设置一个足够长且独特的管理员密码（建议 16 位以上）。
   - `SESSION_SECRET`：设置一段随机且足够长的密钥（建议 32 字符以上）。
3. 如果控制台支持 Secret 类型，优先将这两个值设置为 Secret。
4. 保存并重新部署。

**注意：** 不要把密码或密钥写进 GitHub 文件，也不要把它们发给任何人。

### F. 登录后台
访问 `https://项目名.pages.dev/`，使用：
- 用户名：`admin`
- 密码：你在 `ADMIN_PASSWORD` 设置的值

### G. 以后绑定自己的域名
1. 在 Cloudflare 添加并完成域名 DNS 接入（需要拥有该域名）。
2. Pages 项目 → `Custom domains` → `Set up a custom domain`，添加要作为后台入口的管理域名，例如 `panel.example.com`。
3. 对每个用于跳转/直连的域名，也需要先在同一个 Pages 项目的 `Custom domains` 中添加，并按 Cloudflare 提示完成 DNS 配置。
4. 登录后台，在“域名管理”中添加完全相同的主机名（只填 `go.example.com`，不要填协议、路径或端口），选择模式并填写目标地址。
5. 等待 DNS 与证书生效后测试。

### H. GitHub 自动部署
连接 Git 后，提交到默认分支的更改会触发 Pages 自动部署。日常修改前端文件可直接在 GitHub 网页中编辑。修改 `functions/` 后也会随 Pages 一起部署。

## 使用说明
- **跳转模式**：访问已登记域名时，服务端返回 302 到设置的目标 URL。
- **直连落地页模式**：访问已登记域名时，显示标题、描述和“继续访问”按钮；访客清楚知道将访问哪个目标。
- 目标 URL 仅允许 `http://` 或 `https://`。
- 未登记/已停用域名不会执行跳转。
- 统计仅记录服务端累计访问次数，不采集访客身份信息。

## 安全与运维
- 管理员密码和会话密钥只放 Cloudflare 环境变量。
- 定期备份 D1 数据库。
- 不要将管理域名和业务跳转域名混用。
- 若域名被浏览器或平台拦截，请先检查目标网站内容、HTTPS、DNS、域名信誉及平台申诉流程；不能保证任何域名“永不被拦截”。
