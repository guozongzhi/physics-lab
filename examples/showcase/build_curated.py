"""Rebuild the project's curated OBJ models and original PNG covers.

Run with Python 3 + Pillow. Geometry is a teaching schematic, not CAD or field data.
"""
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent


class Mesh:
    def __init__(self):
        self.vertices, self.faces, self.colors = [], [], []

    def part(self, vertices, faces, color):
        offset = len(self.vertices)
        self.vertices.extend(vertices)
        self.faces.extend(tuple(i + offset for i in face) for face in faces)
        self.colors.extend([color] * len(faces))

    def box(self, center, size, color):
        x, y, z = center
        a, b, c = [s / 2 for s in size]
        self.part([(x+dx*a, y+dy*b, z+dz*c) for dx, dy, dz in
                   [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                    (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],
                  [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),
                   (0,4,7,3),(1,2,6,5)], color)

    def torus(self, z, radius, tube, color):
        n, m = 64, 10
        vertices = []
        for i in range(n):
            a = 2*math.pi*i/n
            for j in range(m):
                b = 2*math.pi*j/m
                r = radius+tube*math.cos(b)
                vertices.append((r*math.cos(a), r*math.sin(a), z+tube*math.sin(b)))
        self.part(vertices, [(i*m+j, ((i+1)%n)*m+j,
                              ((i+1)%n)*m+(j+1)%m, i*m+(j+1)%m)
                             for i in range(n) for j in range(m)], color)

    def dee(self, sign, color):
        # Open-top D-shaped electrode: floor, curved wall, straight wall at gap.
        n, R, gap, h, thick = 48, .86, .065, .25, .045
        vertices, faces = [], []
        for y, radius in [(-h,R),(-h+thick,R-thick), (h,R), (h,R-thick)]:
            vertices.extend((sign*(gap+radius*math.cos(-math.pi/2+i*math.pi/n)),
                             y, radius*math.sin(-math.pi/2+i*math.pi/n)) for i in range(n+1))
        stride = n+1
        # Solid floor fan above and below; offset center stays on straight edge.
        vertices += [(sign*gap,-h,0),(sign*gap,-h+thick,0)]
        for i in range(n):
            faces += [(4*stride,i+1,i), (4*stride+1,stride+i,stride+i+1),
                      (i,i+1,2*stride+i+1,2*stride+i),
                      (3*stride+i,3*stride+i+1,stride+i+1,stride+i),
                      (2*stride+i,2*stride+i+1,3*stride+i+1,3*stride+i)]
        # End caps. Straight electrode wall uses a separate box below.
        faces += [(0,2*stride,3*stride,stride),
                  (n,stride+n,3*stride+n,2*stride+n)]
        if sign < 0:
            faces = [tuple(reversed(f)) for f in faces]
        self.part(vertices, faces, color)
        self.box((sign*(gap+thick/2),0,0),(thick,2*h,2*R),color)

    def write(self, name, comments):
        lines = ['# '+line for line in comments]
        # Present the upper structure to the existing viewer's default camera.
        angle = -1.0
        posed = [(x,y*math.cos(angle)-z*math.sin(angle),
                  y*math.sin(angle)+z*math.cos(angle)) for x,y,z in self.vertices]
        lines += ['# Rigid display pose: -1 rad about X; dimensions unchanged.']
        lines += ['v '+' '.join(f'{x:.7f}' for x in v) for v in posed]
        lines += ['f '+' '.join(str(i+1) for i in f) for f in self.faces]
        (ROOT / name).write_text('\n'.join(lines)+'\n')


helm = Mesh()
for z in [-.39,.39]:
    for dz in [-.035,0,.035]:
        helm.torus(z+dz,.78,.019,(71,194,233))
    for x in [-.48,.48]:
        helm.box((x,-.83,z),(.10,.49,.15),(66,102,158))
        helm.box((x,-1.09,z),(.23,.07,.27),(112,159,211))
helm.box((0,-1.17,0),(1.70,.12,1.40),(32,58,104))
helm.box((0,0,0),(1.22,.027,.027),(232,241,255))
helm.box((.03,0,0),(.16,.085,.085),(112,231,220))
helm.box((.64,-.58,0),(.08,1.12,.10),(116,154,198))
helm.write('helmholtz.obj', ['Helmholtz coil teaching schematic; not manufacturing CAD.',
                           'Coil mean radius R=0.78; pair center separation d=0.78=R.',
                           'Three toroidal strands represent each winding pack.',
                           'Center bar represents a Hall probe; no computed magnetic field.'])

cyclotron = Mesh()
cyclotron.box((0,-.37,0),(2.05,.16,1.98),(36,62,108))
cyclotron.dee(1,(80,164,240))
cyclotron.dee(-1,(75,208,218))
# Ion source, vertical axis guide, and two RF feed terminals.
cyclotron.box((0,-.09,0),(.045,.12,.045),(225,242,255))
for x in [-.63,.63]:
    cyclotron.box((x,-.48,0),(.13,.14,.13),(122,158,217))
cyclotron.write('cyclotron.obj', ['Cyclotron D-electrode cutaway teaching schematic.',
                                 'Open tops reveal cavities; central slit is the acceleration gap.',
                                 'No magnetic poles, vacuum shell, or calculated particle trajectory.',
                                 'Not a scale engineering or manufacturing model.'])


def font(size, chinese=False):
    candidates = (["/System/Library/Fonts/STHeiti Medium.ttc"] if chinese else []) + [
        '/System/Library/Fonts/Supplemental/Arial.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
    for p in candidates:
        if Path(p).exists():
            return ImageFont.truetype(p,size)
    return ImageFont.load_default()


def background(number, subject, title, subtitle):
    im = Image.new('RGB',(1200,675))
    px=im.load()
    for y in range(675):
        for x in range(1200):
            glow=max(0,1-math.hypot((x-840)/900,(y-370)/650))
            px[x,y]=(int(5+8*glow),int(14+23*glow),int(34+45*glow))
    d=ImageDraw.Draw(im)
    for x in range(40,1200,40):d.line((x,130,x,620),fill=(20,39,65))
    for y in range(140,620,40):d.line((40,y,1160,y),fill=(20,39,65))
    d.rounded_rectangle((42,34,1160,639),radius=22,outline=(48,78,114),width=2)
    d.text((76,64),f'PHYSICS ATELIER   /   {number}   /   {subject}',font=font(17),fill=(104,219,237))
    d.text((76,111),title,font=font(44,True),fill=(236,245,255))
    d.text((78,173),subtitle,font=font(18,True),fill=(153,178,209))
    d.text((77,590),'ADMIN  /  PUBLIC COLLECTION',font=font(14),fill=(120,149,188))
    return im,d


def model_cover(mesh,name,number,title,subtitle,detail):
    im,d=background(number,'ELECTROMAGNETISM',title,subtitle)
    scale, center_y = (175, 370) if number == '01' else (200, 400)
    # Same orthographic camera for reproducible covers; depth-sort all faces.
    def rotate(v):
        x,y,z=v; a=-.55;b=.35
        u=x*math.cos(a)+z*math.sin(a);w=-x*math.sin(a)+z*math.cos(a)
        return u,y*math.cos(b)-w*math.sin(b),y*math.sin(b)+w*math.cos(b)
    vv=[rotate(v) for v in mesh.vertices]
    for i in sorted(range(len(mesh.faces)),key=lambda j:sum(vv[k][2] for k in mesh.faces[j])/len(mesh.faces[j])):
        f=mesh.faces[i];p=[vv[j] for j in f]
        u=[p[1][j]-p[0][j] for j in range(3)];v=[p[2][j]-p[0][j] for j in range(3)]
        n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        length=math.sqrt(sum(q*q for q in n)) or 1
        light=.56+.44*abs(sum(n[j]*[-.3,.7,.65][j] for j in range(3))/length)
        color=tuple(min(255,int(c*light)) for c in mesh.colors[i])
        d.polygon([(820+x*scale,center_y-y*scale) for x,y,z in p],fill=color)
    d.text((80,283),'3D / 结构检视',font=font(25,True),fill=(126,222,245))
    for i,line in enumerate(detail):d.text((80,339+i*38),line,font=font(20,True),fill=(182,205,233))
    d.rounded_rectangle((78,493,342,540),radius=20,fill=(27,63,108),outline=(72,131,195))
    d.text((99,504),'旋转  /  缩放  /  线框',font=font(18,True),fill=(204,232,255))
    im.save(ROOT/'covers'/name)


(ROOT/'covers').mkdir(exist_ok=True)
model_cover(helm,'helmholtz.png','01','亥姆霍兹线圈','从双线圈结构，理解均匀磁场的设计。',
            ['同轴双线圈 · d = R','线圈绕组 / 支架 / 中心探头','教学结构模型 · 非场强仿真'])
model_cover(cyclotron,'cyclotron.png','02','回旋加速器','剖开 D 形电极，观察粒子加速的空间。',
            ['双 D 形电极 · 中央加速间隙','开放顶盖 / 空腔 / 离子源','结构示意 · 非真实轨迹计算'])
im,d=background('03','MECHANICS','让振动留下轨迹','可调参数的弹簧振子 · 相空间与能量实验')
d.text((80,285),'INTERACTIVE / 交互实验',font=font(24,True),fill=(126,222,245))
for i,line in enumerate(['四种阻尼状态，一键比较','改变 k、c、A，观察运动','解析解驱动 · SI 单位']):
    d.text((80,340+i*38),line,font=font(20,True),fill=(182,205,233))
points=[]
for i in range(1201):
    t=i/100;decay=math.exp(-.4*t)
    points.append((825+230*decay*(math.cos(4.22*t)+.4/4.22*math.sin(4.22*t)),
                   408+155*decay*math.sin(4.22*t)))
d.line((570,408,1100,408),fill=(66,94,131),width=2)
d.line((825,245,825,568),fill=(66,94,131),width=2)
d.line(points,fill=(103,232,249),width=4)
d.ellipse((points[0][0]-7,points[0][1]-7,points[0][0]+7,points[0][1]+7),fill=(225,250,255))
d.text((1078,420),'x/A',font=font(17),fill=(149,183,219))
d.text((844,249),'v/(Aω0)',font=font(17),fill=(149,183,219))
im.save(ROOT/'covers'/'damped-oscillator.png')

items=[
    dict(title='亥姆霍兹线圈 · 三维结构',category='model',file='helmholtz.obj',cover='covers/helmholtz.png',
         description='由本项目线圈示例精修而成。可旋转、缩放并切换线框，观察同轴双线圈、绕组、支架和中心探头。线圈中心间距等于平均半径（d=R）。教学结构示意，不提供磁场数值仿真，也不作为制造图纸。'),
    dict(title='回旋加速器 · D形电极剖视',category='model',file='cyclotron.obj',cover='covers/cyclotron.png',
         description='由本项目回旋加速器示例精修而成。开放顶盖的双D形电极展示空腔、中央加速间隙与离子源，可旋转、缩放和查看线框。电极不是磁极；模型未包含外部磁极、真空外壳或真实粒子轨迹计算，仅用于结构教学。'),
    dict(title='让振动留下轨迹 · 阻尼实验室',category='html',file='damped-oscillator.html',cover='covers/damped-oscillator.png',
         description='由本项目弹簧振子测试示例完善而成。调节劲度系数、阻尼与初始位移，对比无阻尼、欠阻尼、临界和过阻尼；联动显示振子、相空间、位移曲线与机械能。采用m=1 kg线性阻尼模型的解析解，支持暂停、继续和复位。教学模型，不代表实测数据。')]
(ROOT/'curated.json').write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n')
print('Built 2 OBJ models, 3 PNG covers, curated.json')
