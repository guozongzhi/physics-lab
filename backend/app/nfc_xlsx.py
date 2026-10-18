"""Small OOXML reader/writer for the NFC register, with bounded ZIP/XML input."""
from io import BytesIO
import posixpath
import re
from xml.etree import ElementTree as ET
from zipfile import ZipFile, ZIP_DEFLATED, BadZipFile
from fastapi import HTTPException

NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
HEADERS = ['卡片UID', '学生账号', '学生姓名', '班级', '小组', '状态']


def export_xlsx(data):
    # Inline string cells preserve leading-zero UIDs and never execute formulas.
    cards = [HEADERS] + [[r['cardUid'], r['username'], r['studentName'], r['className'], r['groupName'], r['status']]
                         for r in data['cards']]
    bound = {r['userId'] for r in data['cards'] if r['userId']}
    roster = [['学生账号', '学生姓名', '班级', '小组', '领卡状态']] + [
        [u['username'], u['name'], u['className'], u['groupName'], '已领卡' if u['id'] in bound else '待领卡']
        for u in data['students']]
    notes = [['版本', data['version']], ['使用方法', '修改卡片登记中的学生账号，导入预览后确认更新。'],
             ['换绑', '调整已有归属需在后台勾选允许换绑。'],
             ['清空账号', '学生账号留空会解除该卡当前绑定；未列入文件的卡片保持不变。'],
             ['参考列', '姓名、班级、小组由学生账号自动查询，不修改学生基础信息。'],
             ['UID格式', '卡片UID必须保留为文本，不能转成数字。'],
             ['过期文件', '后台登记发生变化后，应重新导出再修改。']]
    sheets = [('卡片登记', cards), ('班级名单', roster), ('说明', notes)]
    buffer = BytesIO()
    with ZipFile(buffer, 'w', ZIP_DEFLATED) as z:
        types = ET.Element('Types', xmlns='http://schemas.openxmlformats.org/package/2006/content-types')
        for ext, content in [('rels', 'application/vnd.openxmlformats-package.relationships+xml'), ('xml', 'application/xml')]:
            ET.SubElement(types, 'Default', Extension=ext, ContentType=content)
        overrides = [('/xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml')]
        overrides += [(f'/xl/worksheets/sheet{i}.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml') for i in range(1,4)]
        for name, content in overrides:
            ET.SubElement(types, 'Override', PartName=name, ContentType=content)
        z.writestr('[Content_Types].xml', ET.tostring(types))
        root_rel = ET.Element('Relationships', xmlns=PKG)
        ET.SubElement(root_rel, 'Relationship', Id='rId1', Type=REL+'/officeDocument', Target='xl/workbook.xml')
        z.writestr('_rels/.rels', ET.tostring(root_rel))
        book = ET.Element('workbook', xmlns=NS)
        items = ET.SubElement(book, 'sheets')
        relationships = ET.Element('Relationships', xmlns=PKG)
        for i, (name, values) in enumerate(sheets, 1):
            ET.SubElement(items, 'sheet', name=name, sheetId=str(i), attrib={f'{{{REL}}}id':f'rId{i}'})
            ET.SubElement(relationships, 'Relationship', Id=f'rId{i}', Type=REL+'/worksheet', Target=f'worksheets/sheet{i}.xml')
            sheet = ET.Element('worksheet', xmlns=NS)
            views=ET.SubElement(sheet,'sheetViews');view=ET.SubElement(views,'sheetView',workbookViewId='0')
            ET.SubElement(view,'pane',ySplit='1',topLeftCell='A2',activePane='bottomLeft',state='frozen')
            cols=ET.SubElement(sheet,'cols')
            for col in range(1,len(values[0])+1):
                ET.SubElement(cols,'col',min=str(col),max=str(col),width='24' if name!='说明' else ('20' if col==1 else '95'),customWidth='1')
            grid=ET.SubElement(sheet,'sheetData')
            for row_index,row in enumerate(values,1):
                element=ET.SubElement(grid,'row',r=str(row_index),ht='24',customHeight='1')
                for col,value in enumerate(row):
                    cell=ET.SubElement(element,'c',r=f'{chr(65+col)}{row_index}',t='inlineStr')
                    ET.SubElement(ET.SubElement(cell,'is'),'t').text=str(value or '')
            if name!='说明': ET.SubElement(sheet,'autoFilter',ref=f'A1:{chr(64+len(values[0]))}{len(values)}')
            z.writestr(f'xl/worksheets/sheet{i}.xml',ET.tostring(sheet))
        z.writestr('xl/workbook.xml',ET.tostring(book))
        z.writestr('xl/_rels/workbook.xml.rels',ET.tostring(relationships))
    return buffer.getvalue()


def read_xlsx(body):
    try:
        with ZipFile(BytesIO(body)) as z:
            info = z.infolist()
            if len(info)>200 or sum(i.file_size for i in info)>10*1024*1024:
                raise ValueError('文件内容过大')
            if any('vbaProject' in i.filename or 'externalLinks/' in i.filename for i in info):
                raise ValueError('不支持宏或外部链接')
            def xml(name):
                content=z.read(name)
                if b'<!DOCTYPE' in content.upper() or b'<!ENTITY' in content.upper():
                    raise ValueError('不支持 XML 实体')
                return ET.fromstring(content)
            shared=[]
            if 'xl/sharedStrings.xml' in z.namelist():
                shared=[''.join(e.itertext()) for e in xml('xl/sharedStrings.xml').findall(f'{{{NS}}}si')]
            rels={r.attrib['Id']:r.attrib['Target'] for r in xml('xl/_rels/workbook.xml.rels')}
            paths={}
            for sheet in xml('xl/workbook.xml').findall(f'.//{{{NS}}}sheet'):
                target=rels[sheet.attrib[f'{{{REL}}}id']]
                name=posixpath.normpath(target.lstrip('/') if target.startswith('/') else 'xl/'+target)
                if not name.startswith('xl/') or '..' in name.split('/'):
                    raise ValueError('无效工作表路径')
                paths[sheet.attrib['name']]=name
            def read_rows(name,limit):
                result=[]
                for row in xml(paths[name]).findall(f'.//{{{NS}}}sheetData/{{{NS}}}row'):
                    if len(result)>=limit: raise ValueError('最多导入 500 张卡')
                    cells={}
                    for cell in row:
                        if cell.find(f'{{{NS}}}f') is not None: raise ValueError('登记表不支持公式，请粘贴为文本值')
                        column=re.match(r'[A-Z]+',cell.attrib['r'])[0]
                        kind=cell.attrib.get('t','n')
                        value=cell.findtext(f'{{{NS}}}v','')
                        if kind=='s': value=shared[int(value)]
                        elif kind=='inlineStr': value=''.join(cell.find(f'{{{NS}}}is').itertext())
                        elif kind not in ('str','inlineStr') and value: raise ValueError('UID 和账号必须使用文本格式')
                        cells[column]=value.strip()
                    result.append(cells)
                return result
            if '卡片登记' not in paths: raise ValueError('缺少“卡片登记”工作表')
            rows=read_rows('卡片登记',501)
            if not rows or rows[0].get('A')!='卡片UID' or rows[0].get('B')!='学生账号':
                raise ValueError('前两列必须是“卡片UID”和“学生账号”')
            entries=[]
            for index,row in enumerate(rows[1:],2):
                uid,username=row.get('A','').upper(),row.get('B','')
                if not uid and not username: continue
                if not re.fullmatch(r'(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})',uid):
                    raise ValueError(f'第 {index} 行卡片 UID 格式无效')
                entries.append((uid,username))
            if not entries: raise ValueError('登记表没有有效数据')
            version=None
            if '说明' in paths:
                for row in read_rows('说明',30):
                    if row.get('A')=='版本': version=row.get('B') or None
            return entries,version
    except (BadZipFile,KeyError,ValueError,IndexError,TypeError,AttributeError,ET.ParseError) as exc:
        raise HTTPException(400, 'Excel 无法读取：'+str(exc)) from None
