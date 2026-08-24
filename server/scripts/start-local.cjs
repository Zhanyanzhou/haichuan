"use strict";

// 本地开发固定使用单一回环拓扑；生产容器继续使用 server/package.json 的 start:prod。
process.env.HOST = "127.0.0.1";
process.env.PORT = "3000";

require("../dist/main");
