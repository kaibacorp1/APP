import fetch from 'node-fetch';
import nodemailer from 'nodemailer';
import SunCalc from 'suncalc';

const LAT = -43.154289;
const LON = 172.738596;
const ELEV = 41.0;
const MARGIN = 100;
const RADIUS_KM = 100;

const API_KEY = process.env.ADSB_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_TO = process.env.EMAIL_TO;

function sphericalSeparation(az1, el1, az2, el2) {
  const toRad = deg => deg * Math.PI / 180;
  const a1 = toRad(el1);
  const a2 = toRad(el2);
  const dAz = toRad(az1 - az2);
  const cosSep = Math.sin(a1) * Math.sin(a2) + Math.cos(a1) * Math.cos(a2) * Math.cos(dAz);
  return Math.acos(Math.max(-1, Math.min(1, cosSep))) * 180 / Math.PI;
}

async function fetchPlanes() {
  const url = `https://adsbexchange-com1.p.rapidapi.com/v2/lat/${LAT}/lon/${LON}/dist/${RADIUS_KM}/`;
  const res = await fetch(url, {
    headers: {
      'X-RapidAPI-Key': API_KEY,
      'X-RapidAPI-Host': 'adsbexchange-com1.p.rapidapi.com'
    }
  });
  const data = await res.json();
  return data.ac || [];
}

async function sendEmail(match) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: EMAIL_FROM,
      pass: EMAIL_PASS
    }
  });

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: EMAIL_TO,
    subject: '🌞 SUN TRANSIT DETECTED!',
    text: JSON.stringify(match, null, 2)
  });
}

async function detect() {
  const planes = await fetchPlanes();
  const now = new Date();
  const sun = SunCalc.getPosition(now, LAT, LON);
  const sunAz = (sun.azimuth * 180 / Math.PI + 360) % 360;
  const sunAlt = sun.altitude * 180 / Math.PI;

  for (const plane of planes) {
    if (!plane.lat || !plane.lon || !plane.alt_baro) continue;
    const dLat = plane.lat - LAT;
    const dLon = plane.lon - LON;
    const dAlt = plane.alt_baro - ELEV;
    const dist = Math.sqrt(dLat * dLat + dLon * dLon) * 111000; // approx meters
    const elevation = Math.atan2(dAlt, dist) * 180 / Math.PI;
    const azimuth = ((Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360);

    const sep = sphericalSeparation(sunAz, sunAlt, azimuth, elevation);
    if (sep < MARGIN) {
      await sendEmail({ callsign: plane.flight, azimuth, elevation, sep, timestamp: now.toISOString() });
    }
  }
}

setInterval(detect, 15000);
console.log("☀️ Sun transit tracker running...");