<<<<<<< HEAD
# Smart Energy & Carbon Estimation Dashboard

> **Environmental Studies (EVS) Case Study Prototype**  
> **Focus Region:** India & Greater Hyderabad (GHMC), Telangana  
> **Calculation Baseline:** Central Electricity Authority (CEA) FY 2025-26 Database v22.0  

---

## ⚡ Core Calculation Flow

$$\text{Appliance Watts} \times \text{Hours/day} \times \text{Quantity} \longrightarrow \text{Daily kWh} \longrightarrow \text{Monthly kWh } (\times 30) \longrightarrow \text{Monthly } \text{CO}_2 \text{ (kWh } \times 0.675) \longrightarrow \text{Eco Score & Savings Simulator}$$

### Official Formulas
1. **Daily Electricity (kWh):**
   $$\text{Daily kWh} = \frac{\text{Power (Watts)} \times \text{Hours/day} \times \text{Quantity}}{1000}$$

2. **Monthly Electricity (kWh):**
   $$\text{Monthly kWh} = \text{Daily kWh} \times 30$$

3. **Monthly $\text{CO}_2$ Emissions (kg):**
   $$\text{Monthly } \text{CO}_2 = \text{Monthly kWh} \times 0.675\text{ kg } \text{CO}_2/\text{kWh}$$

4. **Estimated Monthly Bill (₹):**
   $$\text{Bill} = \text{Monthly kWh} \times \text{Domestic Tariff Rate (default ₹7.50/unit)}$$

5. **$\text{CO}_2$ Avoided / Saved:**
   $$\text{Saved } \text{CO}_2 = (\text{Old kWh} - \text{New kWh}) \times 0.675$$

---

## 📊 Dashboard Features & Architecture

| Feature | Description |
| :--- | :--- |
| **1. Summary Cards (Top)** | Real-time counters for **Monthly kWh**, **Estimated Bill (₹)**, **Monthly $\text{CO}_2$ (kg)**, and **Eco Score (/100 with Letter Grade A+/A/B/C)**. |
| **2. Interactive Charts** | **Daily Load Profile** (24-hour demand curve showing GHMC peak 6 PM–10 PM), **Appliance-wise Share** (Donut & Bar view toggle), and **This Month vs Last Month comparison**. |
| **3. Appliance Tracker (Table)** | Pre-loaded with standard Indian household appliances (1.5 kW AC, Frost-free Refrigerator, Ceiling Fans, LED lights, TV, Geyser). Live editable Watts, Hours, and Quantity with auto-filled kWh/day, kWh/month, and $\text{CO}_2$/month. Quick-add standard appliance dropdown and custom row adder. |
| **4. Carbon Estimator Panel** | Full transparent breakdown of the formula, why $0.675\text{ kg } \text{CO}_2/\text{kWh}$ is used (CEA v22.0: $1,189.04\text{ Mt } \text{CO}_2 \div 1,761.28\text{ BU}$), annual emissions, and tree sequestration offset equivalents ($21.77\text{ kg/tree/year}$). |
| **5. Smart Tips & Simulator** | Actionable BEE interventions: **AC at 24°C instead of 20°C** (up to 24% saving), **LED retrofits** (70-75% lighting cut), and **Zero Standby Power** (5-10% cut). Interactive toggles simulate instant projected savings on your bill, kWh, and carbon footprint. |
| **6. Goal Tracker** | Configurable monthly carbon budget (default $200\text{ kg } \text{CO}_2$). Visual progress bar with status flags (🟢 On Track, 🟡 Approaching Limit, 🔴 Target Exceeded) and remaining carbon allowance. |
| **7. Policy & SDG Reference** | Maps directly to UN Sustainable Development Goals (**SDG 7, 9, 11, 12, 13**) and highlights local peak demand records (Telangana record $20,003\text{ MW}$ on 15 Oct 2026; GHMC $4,782\text{ MW}$ on 22 May 2026). |

---

## 🚀 How to Run

1. Open `index.html` in any web browser (Chrome, Edge, Firefox, Safari).
2. It requires **no server setup or external dependencies**—the application uses responsive HTML5 canvas graphics and CSS.
3. To view or print the generated audit, click the **Export / Print** button on the top right.
=======
# smart-energy-carbon-estimation-dashboard
evs project 
>>>>>>> origin/main
