import HtmlDemo from './HtmlDemo';
import PhysicsDemo from './PhysicsDemo';
import VideoShowcasePlayer from './VideoShowcasePlayer';
import PaperArticleReader from './PaperArticleReader';
import Model3DViewer from './Model3DViewer';
import { parseShowcaseMedia } from '@/lib/showcaseMedia';

const showcaseFallback = '/images/showcase-fallback.jpg';

export default function ShowcaseContentRenderer({
  title,
  imageUrl,
  htmlContent,
  demoKind,
  description,
  category,
  author,
}: {
  title: string;
  imageUrl?: string;
  htmlContent?: string;
  demoKind?: '' | 'optics' | 'motor';
  description?: string;
  category?: string;
  author?: string;
}) {
  const media = parseShowcaseMedia(htmlContent);

  if (media.kind === 'video') {
    return (
      <VideoShowcasePlayer
        src={media.videoSrc}
        poster={imageUrl || showcaseFallback}
        title={title}
      />
    );
  }

  if (media.kind === 'paper') {
    return <PaperArticleReader markdown={media.markdown} title={title} author={author} />;
  }

  if (media.kind === 'model3d') {
    return <Model3DViewer format={media.format} data={media.data} title={title} />;
  }

  if (media.kind === 'html') {
    return <HtmlDemo html={media.html} title={title} />;
  }

  if (demoKind) {
    return <PhysicsDemo kind={demoKind} />;
  }

  // Fallback for category === 'paper' when user wrote markdown directly in description
  if (category === 'paper' && description && description.trim().length > 80) {
    return <PaperArticleReader markdown={description} title={title} author={author} />;
  }

  return (
    <div className="relative w-full min-h-[240px] bg-ink-100 flex items-center justify-center">
      <img
        src={imageUrl || showcaseFallback}
        alt={title}
        className="relative w-full max-h-[62vh] object-contain"
        onError={(e) => {
          const img = e.currentTarget;
          if (!img.src.endsWith(showcaseFallback)) {
            img.src = showcaseFallback;
          }
        }}
      />
    </div>
  );
}
