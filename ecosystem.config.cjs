/** PM2 process file — run: pm2 start ecosystem.config.cjs */
module.exports = {
  apps: [
    {
      name: "poster-nps",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
