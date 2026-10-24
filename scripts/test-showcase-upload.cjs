// 执行页面中实际的异步上传处理器，用可控 Promise 覆盖慢上传与取消竞争。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const page = fs.readFileSync('src/pages/AchievementHall.tsx', 'utf8');
const handler = page.slice(page.indexOf('  const handleVideoFileUpload ='), page.indexOf('  const handlePaperFileUpload ='));
const guard = page.slice(page.indexOf('  const handleUpload ='), page.indexOf('    setSaveError', page.indexOf('  const handleUpload =')));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function setup() {
  const poster = deferred(), upload = deferred();
  const state = { busy: false, progress: 0, media: '', error: '', form: { imageUrl: '' }, token: 'session' };
  const ref = { current: null };
  const cancel = () => { ref.current?.abort(); ref.current = null; state.busy = false; };
  const context = {
    AbortController, URL, apiEnabled: true, videoUploadRef: ref, MAX_VIDEO_FILE_BYTES: 100 * 1024 * 1024,
    uploadForm: state.form, getToken: () => state.token, captureVideoFrame: () => poster.promise,
    cancelVideoUpload: cancel, setVideoUploading: v => state.busy = v,
    setVideoUploadProgress: v => state.progress = v, setHtmlError: v => state.error = v,
    setUploadForm: f => state.form = f(state.form), setEncodedMedia: v => state.media = v,
    encodeShowcaseMedia: v => v.videoSrc, showcaseApi: { uploadVideo: () => upload.promise },
  };
  const code = ts.transpileModule(handler + '\nglobalThis.runUpload = handleVideoFileUpload;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(code, context);
  const run = () => context.runUpload({ target: { files: [{ name: 'test.mp4', type: 'video/mp4', size: 100 }], value: 'file' } });
  return { state, ref, cancel, poster, upload, run };
}
(async () => {
  let t = setup(), pending = t.run();
  assert.equal(t.state.busy, true, '封面提取前必须锁定提交');
  const submitContext = { saving: false, videoUploadRef: t.ref };
  vm.runInNewContext(guard + '\n return "submitted"; }; globalThis.submit = handleUpload;', submitContext);
  assert.equal(await submitContext.submit(), undefined, '慢上传期间处理器必须拒绝提交');
  t.poster.resolve('poster'); await Promise.resolve();
  t.upload.resolve({ url: '/api/showcase/video/test.mp4' }); await pending;
  assert.equal(t.state.media, '/api/showcase/video/test.mp4');
  assert.equal(t.state.busy, false);

  t = setup(); pending = t.run();
  t.cancel(); t.poster.resolve('stale poster'); await pending;
  assert.equal(t.state.form.imageUrl, '', '关闭弹窗后封面回调不可污染表单');
  assert.equal(t.state.media, '');

  t = setup(); pending = t.run();
  t.poster.resolve('poster'); await Promise.resolve();
  t.cancel(); t.state.form = { imageUrl: 'new work' };
  t.upload.resolve({ url: 'stale video' }); await pending;
  assert.equal(t.state.media, '', '取消后的视频结果不可写入新作品');
  assert.equal(t.state.form.imageUrl, 'new work');

  t = setup(); pending = t.run();
  t.poster.resolve('poster'); await Promise.resolve();
  t.state.token = 'another user'; t.upload.resolve({ url: 'old user video' }); await pending;
  assert.equal(t.state.media, '', '切换用户后丢弃旧上传结果');

  t = setup(); pending = t.run();
  t.poster.resolve('poster'); await Promise.resolve();
  t.upload.reject(new Error('网络中断')); await pending;
  assert.equal(t.state.busy, false);
  assert.ok(t.state.error, '失败后允许重试并保留错误反馈');
  console.log('Showcase upload: 5 async interaction scenarios passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
