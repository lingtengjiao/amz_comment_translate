interface EyeIconProps {
  className?: string;
  withBackground?: boolean;
}

export function EyeIcon({ className = "w-8 h-8", withBackground = false }: EyeIconProps) {
  const eyeSvg = (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={withBackground ? "w-full h-full" : className}
    >
      <defs>
        {/* 虹膜渐变 - 紫色到蓝色 */}
        <radialGradient id="irisGradient" cx="0.35" cy="0.35">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="50%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4f46e5" />
        </radialGradient>
        
        {/* 高光效果 */}
        <radialGradient id="shineGradient" cx="0.3" cy="0.3">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      
      {/* 眼白 - 浅米黄色 */}
      <circle cx="32" cy="32" r="28" fill="#fef3c7" />
      
      {/* 内圈眼白 */}
      <circle cx="32" cy="32" r="22" fill="white" />
      
      {/* 虹膜 - 蓝紫色渐变 */}
      <circle cx="32" cy="32" r="13" fill="url(#irisGradient)" />
      
      {/* 瞳孔 */}
      <circle cx="32" cy="32" r="6" fill="#312e81" />
      
      {/* 主高光 */}
      <ellipse cx="28" cy="27" rx="3.5" ry="5" fill="url(#shineGradient)" />
      
      {/* 次高光 */}
      <circle cx="36" cy="36" r="2" fill="white" opacity="0.6" />
    </svg>
  );

  if (withBackground) {
    return (
      <div className={className}>
        <div className="relative w-full h-full rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg">
          <div className="w-[65%] h-[65%]">
            {eyeSvg}
          </div>
        </div>
      </div>
    );
  }

  return eyeSvg;
}
