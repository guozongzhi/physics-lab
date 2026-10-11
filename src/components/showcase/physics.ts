/** Air → transparent medium, angles measured from the normal. */
export function refractionAngle(incidentDegrees: number, index: number) {
  return Math.asin(Math.sin(incidentDegrees * Math.PI / 180) / index) * 180 / Math.PI;
}
/** Ideal commutated coil: torque magnitude, N I A B |sin θ|, θ between normal and B. */
export function motorTorque(current: number, field: number, angle: number) {
  return 20 * current * 0.01 * field * Math.abs(Math.sin(angle * Math.PI / 180));
}
