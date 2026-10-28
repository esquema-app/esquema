// Pantalla de pago (ficticia): la persona revisa el monto y toca «Pagar».
export function pantallaDePago(cuenta) {
  const boton = document.createElement("button");
  boton.textContent = "Pagar";
  boton.addEventListener("click", () => fetch("/pagos", { method: "POST", body: JSON.stringify({ cuenta: cuenta.id, monto: cuenta.monto }) }));
  return boton;
}
