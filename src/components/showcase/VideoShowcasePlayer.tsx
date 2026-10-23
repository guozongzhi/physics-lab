import { useRef, useState } from 'react';
import { Video, Gauge, Repeat, AlertCircle } from 'lucide-react';

const SPEEDS = [0.5, 1, 1.25, 1.5, 2] as const;

export default function VideoShowcasePlayer({
  src,
  poster,
  title,
}: {
  src: string;
  poster?: string;
  title: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [speed, setSpeed] = useState<number>(1);
  const [loop, setLoop] = useState(false);
  const [loadErr, setLoadErr] = useState(false);

  const changeSpeed = (nextSpeed: number) => {
    setSpeed(nextSpeed);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextSpeed;
    }
  };

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between gap-2 pl-4 pr-14 py-2 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <Video size={14} className="text-sky-400 shrink-0" />
          <span className="font-semibold truncate">{title}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 shrink-0">
            实验视频影像
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded-lg">
            <Gauge size={12} className="text-slate-400" />
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => changeSpeed(s)}
                className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition ${
                  speed === s ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setLoop((l) => !l)}
            className={`px-2 py-1 rounded-lg inline-flex items-center gap-1 text-[11px] font-semibold transition ${
              loop ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Repeat size={12} />
            循环播放
          </button>
        </div>
      </div>

      {loadErr ? (
        <div className="h-[320px] flex flex-col items-center justify-center gap-2 p-6 text-center text-slate-400 text-xs">
          <AlertCircle size={28} className="text-amber-400" />
          <p className="font-semibold text-slate-200">视频源加载失败或格式不受当前浏览器支持</p>
          <p className="text-slate-400 break-all max-w-md">{src.slice(0, 120)}</p>
        </div>
      ) : (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          controls
          playsInline
          loop={loop}
          preload="metadata"
          onError={() => setLoadErr(true)}
          aria-label={`播放视频 ${title}`}
          className="w-full max-h-[62vh] min-h-[260px] bg-black object-contain"
        />
      )}
    </div>
  );
}
