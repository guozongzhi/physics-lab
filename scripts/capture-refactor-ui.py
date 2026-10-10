from pathlib import Path
import os
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
import json

base=os.environ.get('UI_CAPTURE_BASE_URL','http://127.0.0.1:5173')
out=Path(os.environ.get('UI_CAPTURE_OUTPUT', Path(__file__).resolve().parents[1]/'docs/refactoring/screenshots/2026-10-09'))
out.mkdir(parents=True,exist_ok=True)
scenes=[
 ('student-dashboard','student','u-01','g-1','张伟','/dashboard',1440,900),
 ('student-energy','student','u-01','g-1','张伟','/coins',1440,900),
 ('teacher-overview','teacher','teacher',None,'教师','/teacher/overview',1440,900),
 ('teacher-groups','teacher','teacher',None,'教师','/teacher/groups',1440,900),
 ('admin-console','admin','admin',None,'管理员','/admin',1440,900),
 ('student-mobile','student','u-01','g-1','张伟','/dashboard',390,844),
]
if os.environ.get('UI_CAPTURE_INCLUDE_DETAILS') == '1':
    scenes.extend([
        ('student-full-overview','student','u-01','g-1','张伟','/dashboard?view=overview',1440,900),
        ('teacher-analytics','teacher','teacher',None,'教师','/teacher/overview?view=analytics',1440,900),
    ])
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=os.environ.get('UI_CAPTURE_CHROME','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'))
    for name,role,user_id,group_id,display,path,width,height in scenes:
        context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1,color_scheme='light')
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda error: errors.append(str(error)))
        page.goto(base+'/login',wait_until='domcontentloaded')
        page.wait_for_timeout(400)
        page.evaluate('user => localStorage.setItem("plab_current_user", JSON.stringify(user))',{'userId':user_id,'classId':None,'groupId':group_id,'role':role,'name':display})
        page.goto(base+path,wait_until='domcontentloaded')
        page.locator('header').first.wait_for(timeout=15000)
        try:
            page.wait_for_load_state('networkidle',timeout=5000)
        except PlaywrightTimeout:
            pass
        page.wait_for_timeout(800)
        dimensions=page.evaluate('({innerWidth:window.innerWidth,scrollWidth:document.documentElement.scrollWidth})')
        report={'scene':name,'route':page.url,'viewport':f'{width}x{height}','headerCount':page.locator('header').count(),'asideCount':page.locator('aside').count(),'h1':page.locator('h1').all_text_contents()[:2],'horizontalOverflow':dimensions['scrollWidth']-dimensions['innerWidth'],'pageErrors':errors,'screenshot':name+'.png'}
        if report['headerCount']!=1 or report['asideCount']!=1 or errors or report['horizontalOverflow']>2:
            raise AssertionError(report)
        page.screenshot(path=str(out/(name+'.png')),full_page=True,animations='disabled')
        results.append(report)
        context.close()
    browser.close()
(out/'report.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
for r in results:
    print(r['scene'],r['viewport'],'h1=',r['h1'],'header=',r['headerCount'],'aside=',r['asideCount'],'overflow=',r['horizontalOverflow'])
