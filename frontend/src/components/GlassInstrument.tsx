import { useRef, useState, type CSSProperties } from 'react';

const layers = ['shell', 'wedge', 'shell-front', 'hero-joined'] as const;

/** Original Exodus Blender layers and displacement, adapted to NEAR tokenization. */
export function GlassInstrument({
  progress,
  hero = false,
}: {
  progress?: number;
  hero?: boolean;
}) {
  const loaded = useRef(new Set<string>());
  const [ready, setReady] = useState(false);
  const style =
    progress === undefined
      ? undefined
      : ({
          '--slide': progress,
          '--rise': 1,
          '--seam': progress,
          '--glow': progress,
        } as CSSProperties);
  return (
    <div
      className={`instrument ${hero ? 'instrument-hero' : ''} ${ready ? 'is-ready' : ''}`}
      style={style}
      role="img"
      aria-label="The silver principal block and blue glass yield wedge separate into PT and YT."
    >
      <div className="instrument-light" />
      <div className="instrument-canvas">
        {layers.map((layer) => (
          <img
            key={layer}
            className={`instrument-layer layer-${layer}`}
            src={`/glass/${layer}.webp`}
            srcSet={`/glass/${layer}-sm.webp 768w, /glass/${layer}.webp 1536w`}
            sizes="(max-width: 700px) 100vw, 720px"
            alt=""
            width="1536"
            height="1024"
            loading={hero ? 'eager' : 'lazy'}
            onLoad={() => {
              loaded.current.add(layer);
              if (loaded.current.size === layers.length) setReady(true);
            }}
            onError={() => setReady(true)}
            draggable="false"
          />
        ))}
      </div>
      {hero && (
        <>
          <div className="instrument-note note-yield">
            <span className="eyebrow">Yield token</span>
            <strong>Let it flow.</strong>
            <span className="note-line" />
          </div>
          <div className="instrument-note note-principal">
            <span className="note-line" />
            <span className="eyebrow">Principal token</span>
            <strong>Lock it in.</strong>
          </div>
          <span className="instrument-caption mono">
            ONE ASSET. TWO POSSIBILITIES.
          </span>
        </>
      )}
    </div>
  );
}
