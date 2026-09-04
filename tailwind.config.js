/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#0A2A6B",
        accent: "#FF7A00",
        bgLight: "#F5F7FA"
      },
      fontFamily: {
        sans: ["Inter", "Poppins", "sans-serif"]
      }
    }
  },
  plugins: []
}
