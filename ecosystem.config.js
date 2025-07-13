module.exports = {
  apps: [{
    name: 'cat1-listener',
    script: './src/index.js',
    watch: false,
    env: {
      NODE_ENV: 'production',
    },
  }]
};
