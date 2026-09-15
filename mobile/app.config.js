// 설정의 원본은 app.json 이다. 웹 버전을 www.daymo.xyz/app 아래에 올릴 때만 주소 앞부분을
// 더한다(site/README.md). 앱 빌드에는 이 값이 없어서 app.json 그대로다.
module.exports = ({ config }) => {
  const baseUrl = process.env.DAYMO_WEB_BASE_URL;
  if (!baseUrl) return config;
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
