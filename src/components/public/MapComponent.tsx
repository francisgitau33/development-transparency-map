"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getMarkerIconSvg } from "@/lib/icons/marker-icons";

interface Project {
  id: string;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  sectorKey: string;
  status: string;
  locationName: string | null;
  targetBeneficiaries: number | null;
  organization: {
    id: string;
    name: string;
    type: string;
  };
  administrativeArea?: {
    id: string;
    name: string;
    type: string | null;
  } | null;
  donor?: {
    id: string;
    name: string;
  } | null;
}

interface Sector {
  key: string;
  name: string;
  icon: string;
  color: string;
}

interface MapComponentProps {
  projects: Project[];
  sectors: Sector[];
  onProjectClick?: (project: Project) => void;
}

export function MapComponent({ projects, sectors, onProjectClick }: MapComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  const getSector = (sectorKey: string): Sector | undefined => {
    return sectors.find((s) => s.key === sectorKey);
  };

  const getSectorColor = (sectorKey: string): string => {
    return getSector(sectorKey)?.color || "#6b7280";
  };

  const getSectorName = (sectorKey: string): string => {
    return getSector(sectorKey)?.name || sectorKey;
  };

  const getSectorIconSvg = (sectorKey: string): string => {
    const sector = getSector(sectorKey);
    return getMarkerIconSvg(sector?.icon);
  };

  const formatNumber = (num: number | null): string => {
    if (num === null || num === undefined) return "N/A";
    return num.toLocaleString();
  };

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 18,
      worldCopyJump: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapInstanceRef.current = map;
    markersRef.current = L.layerGroup().addTo(map);

    // Leaflet caches the container size at `L.map()` time. When the
    // container is inside a flex column whose height is being resolved on
    // the same tick (e.g. our fullBleed layout), Leaflet can read a
    // too-small size and render the tiles as a short horizontal strip
    // until the next map interaction. Invalidate on next paint, and again
    // on any viewport resize, so the visible map always matches the
    // current container height.
    const invalidate = () => map.invalidateSize({ animate: false });
    const raf = window.requestAnimationFrame(invalidate);
    // Extra pass in case fonts / async layout shift height again shortly.
    const timeout = window.setTimeout(invalidate, 200);
    window.addEventListener("resize", invalidate);

    let resizeObs: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && mapRef.current) {
      resizeObs = new ResizeObserver(() => invalidate());
      resizeObs.observe(mapRef.current);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      window.removeEventListener("resize", invalidate);
      resizeObs?.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !markersRef.current) return;

    markersRef.current.clearLayers();

    const validProjects = projects.filter(
      (p) => p.latitude != null && p.longitude != null
    );

    validProjects.forEach((project) => {
      const color = getSectorColor(project.sectorKey);
      const sectorIconSvg = getSectorIconSvg(project.sectorKey);

      const icon = L.divIcon({
        className: "custom-marker",
        html: `<div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><div style="transform: rotate(45deg); color: white;">${sectorIconSvg}</div></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });

      const marker = L.marker([project.latitude, project.longitude], { icon });

      // escape minimal HTML injection via title/description etc.
      const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      const districtLine = project.administrativeArea
        ? `<p style="margin: 0 0 4px 0; font-size: 12px; color: #64748b;"><strong>District / County:</strong> ${esc(project.administrativeArea.name)}${project.administrativeArea.type ? ` (${esc(project.administrativeArea.type)})` : ""}</p>`
        : "";
      const donorLine = project.donor
        ? `<p style="margin: 0 0 4px 0; font-size: 12px; color: #64748b;"><strong>Donor:</strong> ${esc(project.donor.name)}</p>`
        : "";

      const popupContent = `
        <div style="min-width: 220px; font-family: system-ui, sans-serif;">
          <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #1e293b;">${esc(project.title)}</h3>
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #64748b;"><strong>Organization:</strong> ${esc(project.organization.name)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #64748b;"><strong>Sector:</strong> ${esc(getSectorName(project.sectorKey))}</p>
          ${project.locationName ? `<p style="margin: 0 0 4px 0; font-size: 12px; color: #64748b;"><strong>Location:</strong> ${esc(project.locationName)}</p>` : ""}
          ${districtLine}
          ${donorLine}
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #64748b;"><strong>Target Beneficiaries:</strong> ${formatNumber(project.targetBeneficiaries)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #64748b;"><strong>Status:</strong> <span style="display: inline-block; padding: 2px 8px; background: ${project.status === "ACTIVE" ? "#dcfce7" : project.status === "PLANNED" ? "#fef3c7" : "#e2e8f0"}; color: ${project.status === "ACTIVE" ? "#166534" : project.status === "PLANNED" ? "#92400e" : "#475569"}; border-radius: 9999px; font-size: 11px;">${project.status}</span></p>
          <p style="margin: 8px 0 0 0; font-size: 12px; color: #475569; line-height: 1.4;">${esc(project.description.substring(0, 150))}${project.description.length > 150 ? "..." : ""}</p>
          <a href="/projects/${project.id}" target="_blank" rel="noopener noreferrer" style="display: inline-block; margin-top: 10px; padding: 6px 12px; background: #0284c7; color: white; border-radius: 6px; font-size: 12px; text-decoration: none; font-weight: 500;">View Details</a>
        </div>
      `;

      marker.bindPopup(popupContent);

      if (onProjectClick) {
        marker.on("click", () => onProjectClick(project));
      }

      marker.addTo(markersRef.current!);
    });

    if (validProjects.length > 0) {
      const bounds = L.latLngBounds(
        validProjects.map((p) => [p.latitude, p.longitude] as L.LatLngTuple)
      );
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 8 });
    }
  }, [projects, sectors, onProjectClick]);

  return (
    <div
      ref={mapRef}
      data-design-id="map-container"
      // `absolute inset-0` anchors the Leaflet container to the full size
      // of its `relative` parent. This avoids the classic "narrow strip"
      // bug where a nested `w-full h-full` div cannot resolve `h-full`
      // because its parent's height is computed from flex-1 on the same
      // tick. Absolute positioning reads the parent's resolved box
      // directly. The parent on /map is `map-content` → `flex-1 min-h-0
      // relative`.
      className="absolute inset-0"
    />
  );
}