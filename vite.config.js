import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
    // Electron 需要相对路径
    base: "./",
    build: {
        // 确保资源文件使用相对路径
        assetsDir: "assets",
        // 确保 Web Workers 正确打包
        rollupOptions: {
            output: {
                // 保持 worker 文件名可识别
                entryFileNames: "assets/[name]-[hash].js",
                chunkFileNames: "assets/[name]-[hash].js",
                assetFileNames: "assets/[name]-[hash].[ext]",
            },
        },
    },
    // Worker 配置
    worker: {
        format: "es",
    },
});
