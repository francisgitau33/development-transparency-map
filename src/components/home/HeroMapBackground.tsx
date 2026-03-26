"use client";

import { useEffect, useState } from "react";

interface ProjectMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  sector: string;
  color: string;
}

const sampleProjects: ProjectMarker[] = [
  { id: "1", name: "Solar Farm Initiative", lat: 9.082, lng: 8.675, sector: "Energy", color: "#fbbf24" },
  { id: "2", name: "Clean Water Access", lat: -1.286, lng: 36.817, sector: "Water", color: "#38bdf8" },
  { id: "3", name: "Rural Education Center", lat: 14.497, lng: -14.452, sector: "Education", color: "#a78bfa" },
  { id: "4", name: "Agricultural Training", lat: -6.369, lng: 34.888, sector: "Agriculture", color: "#4ade80" },
  { id: "5", name: "Healthcare Clinic", lat: 6.524, lng: 3.379, sector: "Health", color: "#f87171" },
  { id: "6", name: "Infrastructure Development", lat: 12.639, lng: -8.002, sector: "Infrastructure", color: "#94a3b8" },
  { id: "7", name: "Women Empowerment Hub", lat: 5.614, lng: -0.205, sector: "Social", color: "#fb7185" },
  { id: "8", name: "Tech Training Center", lat: -4.325, lng: 15.322, sector: "Technology", color: "#60a5fa" },
  { id: "9", name: "Sustainable Forestry", lat: -15.416, lng: 28.283, sector: "Environment", color: "#22c55e" },
  { id: "10", name: "Microfinance Project", lat: 15.508, lng: 32.559, sector: "Finance", color: "#f59e0b" },
  { id: "11", name: "Youth Skills Training", lat: 0.347, lng: 32.582, sector: "Education", color: "#a78bfa" },
  { id: "12", name: "Solar Irrigation", lat: 13.756, lng: 2.128, sector: "Energy", color: "#fbbf24" },
  { id: "13", name: "Community Health", lat: -18.879, lng: 47.507, sector: "Health", color: "#f87171" },
  { id: "14", name: "Road Construction", lat: 7.946, lng: -1.023, sector: "Infrastructure", color: "#94a3b8" },
  { id: "15", name: "Water Treatment Plant", lat: -25.746, lng: 28.188, sector: "Water", color: "#38bdf8" },
  { id: "16", name: "Agricultural Coop", lat: 11.588, lng: 37.392, sector: "Agriculture", color: "#4ade80" },
  { id: "17", name: "Digital Literacy", lat: -19.015, lng: 29.155, sector: "Technology", color: "#60a5fa" },
  { id: "18", name: "Reforestation Project", lat: -3.373, lng: 29.363, sector: "Environment", color: "#22c55e" },
  { id: "19", name: "Hospital Expansion", lat: 8.985, lng: 38.798, sector: "Health", color: "#f87171" },
  { id: "20", name: "School Construction", lat: 1.957, lng: 30.104, sector: "Education", color: "#a78bfa" },
  { id: "21", name: "Renewable Energy", lat: -13.254, lng: 34.301, sector: "Energy", color: "#fbbf24" },
  { id: "22", name: "Well Drilling", lat: 12.865, lng: -8.000, sector: "Water", color: "#38bdf8" },
  { id: "23", name: "Farm Equipment", lat: -20.142, lng: 28.580, sector: "Agriculture", color: "#4ade80" },
  { id: "24", name: "Bridge Building", lat: 4.861, lng: 31.571, sector: "Infrastructure", color: "#94a3b8" },
  { id: "25", name: "Vocational Training", lat: -11.202, lng: 17.873, sector: "Education", color: "#a78bfa" },
];

function latLngToXY(lat: number, lng: number, width: number, height: number) {
  const x = ((lng + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return { x, y };
}

export function HeroMapBackground() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const width = 1200;
  const height = 600;

  return (
    <div
      data-design-id="hero-map-background"
      className="absolute inset-0 z-0 opacity-30 pointer-events-none overflow-hidden"
    >
      <svg
        data-design-id="hero-map-svg"
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full object-cover"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="mapGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.2" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect
          data-design-id="hero-map-bg-rect"
          width={width}
          height={height}
          fill="url(#mapGradient)"
        />

        <g data-design-id="hero-map-continents" fill="#0ea5e9" fillOpacity="0.15" stroke="#38bdf8" strokeWidth="0.5" strokeOpacity="0.3">
          <path
            data-design-id="hero-map-africa"
            d="M 570 180 Q 580 170 595 175 L 610 185 Q 625 200 620 230 L 615 260 Q 610 290 595 320 L 580 350 Q 560 380 545 395 L 520 400 Q 505 395 510 370 L 515 340 Q 520 300 530 270 L 540 240 Q 550 210 560 190 Z"
          />
          <path
            data-design-id="hero-map-europe"
            d="M 530 100 Q 545 95 560 100 L 580 105 Q 600 115 610 135 L 615 155 Q 610 170 595 175 L 575 170 Q 555 165 540 155 L 525 140 Q 520 120 525 105 Z"
          />
          <path
            data-design-id="hero-map-asia"
            d="M 620 100 Q 680 85 750 100 L 820 120 Q 880 150 900 190 L 910 230 Q 905 270 880 300 L 840 330 Q 790 350 740 340 L 690 325 Q 650 300 640 260 L 635 220 Q 635 180 650 150 L 630 120 Q 620 110 620 100 Z"
          />
          <path
            data-design-id="hero-map-americas-north"
            d="M 100 100 Q 150 80 200 90 L 260 110 Q 320 140 350 180 L 370 230 Q 380 280 360 330 L 330 360 Q 290 380 250 375 L 200 360 Q 150 330 120 280 L 100 230 Q 90 180 95 140 Z"
          />
          <path
            data-design-id="hero-map-americas-south"
            d="M 280 380 Q 310 370 330 380 L 350 400 Q 370 430 375 470 L 370 520 Q 360 560 340 590 L 310 610 Q 280 620 260 605 L 250 580 Q 245 540 255 500 L 265 450 Q 270 410 275 385 Z"
          />
          <path
            data-design-id="hero-map-australia"
            d="M 850 380 Q 890 370 920 385 L 940 405 Q 955 430 950 460 L 935 490 Q 910 510 880 505 L 855 490 Q 840 465 845 435 L 850 400 Z"
          />
        </g>

        <g data-design-id="hero-map-grid" stroke="#38bdf8" strokeOpacity="0.1" strokeWidth="0.5">
          {[...Array(12)].map((_, i) => (
            <line
              key={`h-${i}`}
              data-design-id={`hero-map-grid-h-${i}`}
              x1="0"
              y1={i * 50}
              x2={width}
              y2={i * 50}
            />
          ))}
          {[...Array(24)].map((_, i) => (
            <line
              key={`v-${i}`}
              data-design-id={`hero-map-grid-v-${i}`}
              x1={i * 50}
              y1="0"
              x2={i * 50}
              y2={height}
            />
          ))}
        </g>

        {mounted && (
          <g data-design-id="hero-map-markers" filter="url(#glow)">
            {sampleProjects.map((project, index) => {
              const { x, y } = latLngToXY(project.lat, project.lng, width, height);
              return (
                <g
                  key={project.id}
                  data-design-id={`hero-map-marker-${project.id}`}
                  className="animate-pulse"
                  style={{
                    animationDelay: `${index * 0.15}s`,
                    animationDuration: `${2 + (index % 3) * 0.5}s`,
                  }}
                >
                  <circle
                    data-design-id={`hero-map-marker-outer-${project.id}`}
                    cx={x}
                    cy={y}
                    r="12"
                    fill={project.color}
                    fillOpacity="0.2"
                  />
                  <circle
                    data-design-id={`hero-map-marker-inner-${project.id}`}
                    cx={x}
                    cy={y}
                    r="5"
                    fill={project.color}
                    fillOpacity="0.8"
                  />
                </g>
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
}