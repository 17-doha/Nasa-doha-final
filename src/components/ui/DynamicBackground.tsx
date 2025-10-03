import React, { useEffect, useState } from "react";

const DynamicBackground: React.FC = () => {
  const [starStyles, setStarStyles] = useState<React.CSSProperties[]>([]);

  useEffect(() => {
    const generateStars = (numStars: number, size: number) => {
      let boxShadow = "";
      for (let i = 0; i < numStars; i++) {
        boxShadow += `${Math.floor(Math.random() * 3000)}px ${Math.floor(Math.random() * 3000)}px #FFF`;
        if (i < numStars - 1) boxShadow += ", ";
      }
      return { width: `${size}px`, height: `${size}px`, background: "transparent", boxShadow };
    };

    const small = generateStars(700, 1);
    const medium = generateStars(200, 2);
    const large = generateStars(100, 3);

    setStarStyles([
      { ...small, animation: "animStar 150s linear infinite" },
      { ...medium, animation: "animStar 100s linear infinite" },
      { ...large, animation: "animStar 50s linear infinite" },
    ]);
  }, []);

  return (
    <>
      <style>{`
        @keyframes animStar { from { transform: translateY(0px); } to { transform: translateY(-3000px); } }
        .stars-background{ position:absolute; inset:0; width:100%; height:100%; display:block;
          background: radial-gradient(ellipse at bottom, #1B2735 0%, #090A0F 100%); z-index:0; }
        .star-layer{ position:absolute; inset:0; }
        .star-layer div{ position:absolute; top:0; }
      `}</style>
      <div className="stars-background">
        {starStyles.map((style, i) => (
          <div key={i} className="star-layer"><div style={style} /></div>
        ))}
      </div>
    </>
  );
};

export default DynamicBackground;
