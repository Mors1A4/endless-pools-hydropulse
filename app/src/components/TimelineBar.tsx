import React from 'react';
import { SwimSegment } from '../types/workout';
import { formatDurationDisplay } from '../services/protocolEngine';

interface TimelineBarProps {
  segments: SwimSegment[];
  currentSegmentIndex?: number;
  segmentElapsedSec?: number;
  interactive?: boolean;
  onSelectSegment?: (index: number) => void;
}

export const TimelineBar: React.FC<TimelineBarProps> = ({
  segments,
  currentSegmentIndex = -1,
  segmentElapsedSec = 0,
  interactive = false,
  onSelectSegment
}) => {
  const totalDuration = segments.reduce((sum, s) => sum + s.durationSec, 0);
  if (totalDuration === 0) return null;

  const getSegmentColor = (type: string, isCurrent: boolean) => {
    switch (type) {
      case 'warmup':
        return isCurrent ? 'bg-sky-400 ring-2 ring-sky-600' : 'bg-sky-300';
      case 'rest':
        return isCurrent ? 'bg-emerald-500 ring-2 ring-emerald-700' : 'bg-emerald-300';
      case 'cooldown':
        return isCurrent ? 'bg-indigo-400 ring-2 ring-indigo-600' : 'bg-indigo-300';
      case 'sprint':
        return isCurrent ? 'bg-blue-600 ring-2 ring-blue-800' : 'bg-blue-400';
      default:
        return isCurrent ? 'bg-water-600 ring-2 ring-water-800' : 'bg-water-400';
    }
  };

  return (
    <div className="w-full space-y-1">
      <div className="flex h-3.5 w-full rounded-full overflow-hidden bg-water-100 p-0.5 border border-water-300">
        {segments.map((seg, idx) => {
          const widthPct = (seg.durationSec / totalDuration) * 100;
          const isCurrent = idx === currentSegmentIndex;
          const isPast = currentSegmentIndex >= 0 && idx < currentSegmentIndex;

          return (
            <div
              key={seg.id || idx}
              style={{ width: `${widthPct}%` }}
              onClick={() => interactive && onSelectSegment?.(idx)}
              className={`h-full transition-all relative ${
                interactive ? 'cursor-pointer' : ''
              } ${getSegmentColor(seg.type, isCurrent)} ${
                isPast ? 'opacity-40' : 'opacity-100'
              }`}
            >
              {isCurrent && (
                <div
                  className="absolute top-0 bottom-0 left-0 bg-white/50 rounded-full"
                  style={{
                    width: `${Math.min(100, (segmentElapsedSec / seg.durationSec) * 100)}%`
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Text legend without emojis or icons */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 px-0.5 font-medium">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-sky-400"></span> Warm-up
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-water-600"></span> Swim
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Break
          </span>
        </div>
        <span className="font-mono text-slate-600 font-bold">
          {formatDurationDisplay(totalDuration)}
        </span>
      </div>
    </div>
  );
};
