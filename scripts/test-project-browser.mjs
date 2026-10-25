import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACTS_DIR = path.resolve('docs/test-artifacts');
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // ignore
    }
    await wait(300);
  }
  throw new Error(`Timeout waiting for ${url}`);
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && this.callbacks.has(data.id)) {
        const { resolve, reject } = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        if (data.error) reject(new Error(JSON.stringify(data.error)));
        else resolve(data.result);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function runTest() {
  console.log('--- 启动前端独立测试服务 (port 4173, standalone mock mode) ---');
  const previewProc = spawn('npx', ['vite', '--port', '4173', '--host', '127.0.0.1'], {
    stdio: 'pipe',
    env: {
      ...process.env,
      VITE_API_BASE_URL: '',
      PATH: '/opt/homebrew/bin:/usr/local/bin:' + process.env.PATH,
    },
  });

  previewProc.stdout.on('data', (d) => process.stdout.write('[preview] ' + d));
  previewProc.stderr.on('data', (d) => process.stderr.write('[preview err] ' + d));

  let chromeProc = null;
  let cdp = null;

  try {
    await waitForHttp('http://127.0.0.1:4173');
    console.log('✓ 预览服务器已就绪');

    const userDataDir = `/tmp/chrome-test-${Date.now()}`;
    console.log('--- 启动 Headless Chrome (CDP port 9222) ---');
    chromeProc = spawn(CHROME_PATH, [
      '--headless=new',
      '--remote-debugging-port=9222',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ]);

    await waitForHttp('http://127.0.0.1:9222/json/version');
    console.log('✓ Chrome CDP 已就绪');

    const targetsRes = await fetch('http://127.0.0.1:9222/json/list');
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    if (!pageTarget?.webSocketDebuggerUrl) {
      throw new Error('未找到可用 Page Target');
    }

    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    console.log('✓ CDP WebSocket 已连接');

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Console.enable');

    cdp.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        console.log('[browser console]', msg.params.type, msg.params.args?.map(a => a.value || a.description).join(' '));
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('[browser error]', msg.params.exceptionDetails);
      }
    });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // 1. 登录为第 4 组组员，注入本地认证状态
    console.log('\n[用例 1] 注入用户会话并访问 /projects ...');
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4173/login' });
    await wait(800);

    await cdp.send('Runtime.evaluate', {
      expression: `
        localStorage.setItem("plab_current_user", JSON.stringify({
          userId: "u-01",
          role: "student",
          groupId: "g-1",
          classId: "c1",
          name: "张伟"
        }));
      `,
    });

    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4173/projects' });
    await wait(1500);

    const initialInfo = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const cards = document.querySelectorAll('.project-mission-card');
          const title = document.querySelector('h1')?.innerText || '';
          return { cardCount: cards.length, pageTitle: title };
        })()
      `,
      returnByValue: true,
    });
    console.log('课题中心加载成功:', initialInfo.result.value);
    if (!initialInfo.result.value.cardCount) {
      throw new Error('课题中心卡片列表为空');
    }

    // 截图 1: 课题中心主视图
    const screenshot1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, '01-project-center-main.png'), Buffer.from(screenshot1.data, 'base64'));
    console.log('✓ 已截图: 01-project-center-main.png');

    // 2. 点击首张卡片 -> 触发进入完整任务看板
    console.log('\n[用例 2] 点击已选中课题卡片进入任务看板...');
    const cardInfo = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const firstCard = document.querySelector('.project-mission-card');
          const isSelected = firstCard?.classList.contains('is-selected');
          const cardTitle = firstCard?.querySelector('h3')?.innerText;
          const url = window.location.pathname;
          return { isSelected, cardTitle, url };
        })()
      `,
      returnByValue: true,
    });
    console.log('首张卡片初始状态:', cardInfo.result.value);

    const clickCardResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const firstCard = document.querySelector('.project-mission-card');
          if (!firstCard) return { clicked: false, error: 'no card' };
          firstCard.click();
          return { clicked: true };
        })()
      `,
      returnByValue: true,
    });
    console.log('点击卡片执行结果:', clickCardResult.result.value);
    await wait(800);

    const cardInfoAfterFirstClick = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const firstCard = document.querySelector('.project-mission-card');
          const isSelected = firstCard?.classList.contains('is-selected');
          const panel = document.querySelector('.workspace-dialog-panel');
          const url = window.location.pathname;
          return { isSelected, isOpen: Boolean(panel), url };
        })()
      `,
      returnByValue: true,
    });
    console.log('第一次点击后状态:', cardInfoAfterFirstClick.result.value);

    const kanbanStatus = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const panel = document.querySelector('.workspace-dialog-panel');
          const heading = panel ? panel.querySelector('h2')?.innerText : '';
          return { isOpen: Boolean(panel), heading };
        })()
      `,
      returnByValue: true,
    });
    console.log('看板展开验证结果:', kanbanStatus.result.value);
    if (!kanbanStatus.result.value.isOpen) {
      throw new Error('任务看板未能成功弹出');
    }

    // 截图 2: 任务看板弹窗
    const screenshot2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, '02-project-kanban-dialog.png'), Buffer.from(screenshot2.data, 'base64'));
    console.log('✓ 已截图: 02-project-kanban-dialog.png');

    // 关闭看板
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const closeBtn = document.querySelector('.workspace-dialog-panel button');
          if (closeBtn) closeBtn.click();
        })()
      `,
    });
    await wait(500);

    // 3. 点击「录入器材 / 管理器材」按钮 -> 弹出器材清单弹窗
    console.log('\n[用例 3] 验证器材管理弹窗与器材增改...');
    const clickEquipResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('录入器材') || b.innerText.includes('管理器材'));
          if (btn) { btn.click(); return { found: true }; }
          return { found: false };
        })()
      `,
      returnByValue: true,
    });
    console.log('点击器材按钮结果:', clickEquipResult.result.value);
    if (!clickEquipResult.result.value.found) {
      throw new Error('未找到录入器材按钮');
    }
    await wait(500);

    const equipModalStatus = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const modalTitle = document.querySelector('h3')?.innerText || '';
          const hasModal = document.body.innerText.includes('实验器材清单');
          return { hasModal, modalTitle };
        })()
      `,
      returnByValue: true,
    });
    console.log('器材清单弹窗状态:', equipModalStatus.result.value);
    if (!equipModalStatus.result.value.hasModal) {
      throw new Error('器材清单管理弹窗未能成功打开');
    }

    // 在弹窗中输入一项新器材并保存
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const nameInputs = document.querySelectorAll('input[type="text"]');
          if (nameInputs.length > 0) {
            const input = nameInputs[nameInputs.length - 1];
            input.value = '范德格拉夫起电机';
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        })()
      `,
    });
    await wait(300);

    // 截图 3: 器材管理弹窗
    const screenshot3 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, '03-equipment-editor-modal.png'), Buffer.from(screenshot3.data, 'base64'));
    console.log('✓ 已截图: 03-equipment-editor-modal.png');

    // 点击保存器材清单
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('保存器材清单'));
          if (saveBtn) saveBtn.click();
        })()
      `,
    });
    await wait(600);

    // 4. 点击「安全状态」卡片 -> 验证直达安全考核入口
    console.log('\n[用例 4] 验证安全状态卡片跳转安全考核...');
    const safetyClickResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const safetyBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('安全状态') || b.innerText.includes('进入安全考核') || b.innerText.includes('查看考核'));
          if (safetyBtn) { safetyBtn.click(); return { clicked: true }; }
          return { clicked: false };
        })()
      `,
      returnByValue: true,
    });
    console.log('点击安全卡片:', safetyClickResult.result.value);
    await wait(1000);

    const safetyPageCheck = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          return {
            url: window.location.pathname,
            hasSafetyTitle: document.body.innerText.includes('安全') || document.body.innerText.includes('考核'),
            h1: document.querySelector('h1')?.innerText || document.querySelector('h2')?.innerText || ''
          };
        })()
      `,
      returnByValue: true,
    });
    console.log('安全考核页校验结果:', safetyPageCheck.result.value);
    if (!safetyPageCheck.result.value.url.includes('/safety')) {
      throw new Error(`预期跳转到安全考核页，实际 URL: ${safetyPageCheck.result.value.url}`);
    }

    // 截图 4: 安全准入考核界面
    const screenshot4 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, '04-safety-exam-navigation.png'), Buffer.from(screenshot4.data, 'base64'));
    console.log('✓ 已截图: 04-safety-exam-navigation.png');

    console.log('\n========================================');
    console.log('🎉 所有浏览器真实渲染与交互测试全部通过！');
    console.log('========================================\n');
  } finally {
    if (cdp) cdp.close();
    if (chromeProc) chromeProc.kill('SIGTERM');
    if (previewProc) previewProc.kill('SIGTERM');
  }
}

runTest().catch((err) => {
  console.error('\n❌ 浏览器自动化测试失败:', err);
  process.exit(1);
});
