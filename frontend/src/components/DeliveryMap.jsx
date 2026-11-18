import React, { useEffect, useRef } from "react";
import L from "leaflet";

export default function DeliveryMap({
  shopLocation = { lat: 18.5304, lng: 73.8467 },
  customerLocation = { lat: 18.5204, lng: 73.8567 },
  driverLocation = { lat: 18.5254, lng: 73.8517 },
  shopName = "Shop",
  customerName = "Customer",
  status = "ASSIGNED",
  height = "320px",
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Default coordinates fallback if missing or invalid
    const shopLat = shopLocation?.lat || 18.5304;
    const shopLng = shopLocation?.lng || 73.8467;
    const custLat = customerLocation?.lat || 18.5204;
    const custLng = customerLocation?.lng || 73.8567;
    const driverLat = driverLocation?.lat || 18.5254;
    const driverLng = driverLocation?.lng || 73.8517;

    // If map already exists, remove it before reinitializing
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    }).setView([driverLat, driverLng], 14);

    mapInstanceRef.current = map;

    // Free OpenStreetMap tile layer (zero paid APIs)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // Custom SVG Marker Icons
    const createSvgIcon = (color, label, emoji) => {
      return L.divIcon({
        className: "custom-leaflet-marker",
        html: `
          <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            transform: translate(-50%, -100%);
          ">
            <div style="
              background: ${color};
              color: white;
              padding: 6px 10px;
              border-radius: 20px;
              font-size: 11px;
              font-weight: 700;
              box-shadow: 0 4px 10px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              gap: 4px;
              white-space: nowrap;
              border: 2px solid white;
            ">
              <span>${emoji}</span>
              <span>${label}</span>
            </div>
            <div style="
              width: 0;
              height: 0;
              border-left: 6px solid transparent;
              border-right: 6px solid transparent;
              border-top: 8px solid ${color};
              margin-top: -1px;
            "></div>
          </div>
        `,
        iconSize: [30, 42],
        iconAnchor: [15, 42],
      });
    };

    const shopIcon = createSvgIcon("#16a34a", shopName || "Shop", "🏪");
    const driverIcon = createSvgIcon("#2563eb", "Driver (You)", "🛵");
    const custIcon = createSvgIcon("#dc2626", customerName || "Customer", "📍");

    const shopMarker = L.marker([shopLat, shopLng], { icon: shopIcon }).addTo(map);
    shopMarker.bindPopup(`<strong>${shopName}</strong><br/>Pickup Location`);

    const customerMarker = L.marker([custLat, custLng], { icon: custIcon }).addTo(map);
    customerMarker.bindPopup(`<strong>${customerName}</strong><br/>Delivery Dropoff`);

    const driverMarker = L.marker([driverLat, driverLng], { icon: driverIcon }).addTo(map);
    driverMarker.bindPopup(`<strong>Delivery Partner</strong><br/>Status: ${status}`);

    // Route path line connecting Shop -> Driver -> Customer
    const latlngs = [
      [shopLat, shopLng],
      [driverLat, driverLng],
      [custLat, custLng],
    ];

    const polyline = L.polyline(latlngs, {
      color: "#3b82f6",
      weight: 4,
      dashArray: "6, 8",
      opacity: 0.8,
    }).addTo(map);

    // Fit map bounds to encompass all points
    const bounds = L.latLngBounds([
      [shopLat, shopLng],
      [driverLat, driverLng],
      [custLat, custLng],
    ]);
    map.fitBounds(bounds, { padding: [40, 40] });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [shopLocation, customerLocation, driverLocation, shopName, customerName, status]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden shadow-inner border border-gray-200">
      <div ref={mapContainerRef} style={{ height, width: "100%" }} className="z-10" />
      <div className="absolute top-2 right-2 z-20 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded text-xs font-semibold text-gray-700 shadow-sm border">
        Live Free GPS (OSM)
      </div>
    </div>
  );
}
