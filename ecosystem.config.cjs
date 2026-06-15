module.exports = {
  apps: [
    {
      name: 'velora-backend',
      script: 'npx',
      args: 'tsx src/index.ts',
      cwd: '/root/metamask-hackathone/backend',
      env: {
        NODE_ENV: 'production',
        PORT: '8930',
      },
      max_memory_restart: '512M',
      autorestart: true,
      watch: false,
    },
    {
      name: 'velora-frontend',
      script: 'npx',
      args: 'next start -p 3000',
      cwd: '/root/metamask-hackathone/frontend',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      max_memory_restart: '256M',
      autorestart: true,
      watch: false,
    },
  ],
}
