import React from 'react';
import { SpeedUnit } from '../types/workout';
import { formatPaceDisplay } from '../services/protocolEngine';

interface SpeedGaugeProps {
  paceSec100m: number;
  speedPercent: number;
  speedUnit: SpeedUnit;
  isMotorOn: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const SpeedGauge: React.FC<SpeedGaugeProps> = ({
  paceSec100m,
  speedPercent,
  speedUnit,
  isMotorOn,
  size = 'md'
}) => {
  const radius = size === 'xl' ? 110 : size === 'lg' ? 85 : size === 'md' ? 65 : 45;
  const stroke = size === 'xl' ? 12 : size === 'lg' ? 10 : size === 'md' ? 8 : 6;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (speedPercent / 100) * circumference;

  const displayPace = formatPaceDisplay(paceSec100m, speedUnit);
  const dimension = (radius + stroke) * 2;

  return (
    <div className="relative flex flex-col items-center justify-center">
      <svg
        width={dimension}
        height={dimension}
        className="transform -rotate-90 transition-all duration-300"
      >
        {/* Background track: soft pool water border */}
        <circle
          cx={radius + stroke}
          cy={radius + stroke}
          r={radius}
          className="stroke-water-200"
          strokeWidth={stroke}
          fill="transparent"
        />

        {/* Active flow progress arc: clean pool blue */}
        <circle
          cx={radius + stroke}
          cy={radius + stroke}
          r={radius}
          className={`transition-all duration-500 ${
            !isMotorOn
              ? 'stroke-slate-300'
              : 'stroke-water-600'
          }`}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>

      {/* Center text display */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className={`font-black tracking-tight ${
            size === 'xl'
              ? 'text-4xl md:text-5xl text-water-900'
              : size === 'lg'
              ? 'text-3xl text-water-900'
              : size === 'md'
              ? 'text-2xl text-water-800'
              : 'text-lg text-water-800'
          }`}
        >
          {paceSec100m === 0 ? 'REST' : displayPace}
        </span>
        <span className="text-xs uppercase font-bold tracking-wider text-slate-500 mt-0.5">
          {isMotorOn ? `${speedPercent}% Flow` : 'Motor Off'}
        </span>
      </div>
    </div>
  );
};
