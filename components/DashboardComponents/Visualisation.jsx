'use client'
import dayjs from "dayjs";
import { Line } from "react-chartjs-2";
import { useEffect, useState } from "react";
import {
    Chart as ChartJS,
    LineElement,
    CategoryScale,
    LinearScale,
    PointElement,
    Tooltip,
    Legend,
    Filler,
} from "chart.js";


ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend, Filler);
function Visualisation({ myProducts }) {
    const [grossVolumes, setGrossVolumes] = useState([]);

    const calculateDailyGrossVolumes = (products) => {
        const dailyTotals = {};

        products.forEach(product => {
            product.sales.forEach(sale => {
                const date = dayjs(sale.createdAt).format("YYYY-MM-DD");
                const gross = sale.quantity * sale.price;
                if (!dailyTotals[date]) {
                    dailyTotals[date] = 0;
                }
                dailyTotals[date] += gross;
            });
        });

        return Object.entries(dailyTotals)
            .map(([date, grossVolume]) => ({ date, grossVolume }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    };

    const getLast30Days = () => {
        const days = [];
        for (let i = 29; i >= 0; i--) {
            days.push(dayjs().subtract(i, "day").format("YYYY-MM-DD"));
        }
        return days;
    };

    const formatLabel = (dateStr) => dayjs(dateStr).format("DD MMM");

    const getChartData = () => {
        const last30Days = getLast30Days();
        const volumeMap = {};
        grossVolumes.forEach(({ date, grossVolume }) => {
            volumeMap[date] = grossVolume;
        });
        const data = last30Days.map(date => volumeMap[date] || 0);
        return {
            labels: last30Days.map(formatLabel),
            datasets: [
                {
                    label: "Gross Volume (SGD)",
                    data,
                    fill: true,
                    borderColor: "#888",
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    borderWidth: 2,

                },
            ],
        };
    };
    useEffect(() => {
        if (myProducts.length > 0) {
            setGrossVolumes(calculateDailyGrossVolumes(myProducts));
        }
    }, [myProducts]);
    return (
        <div className="col-span-4 row-span-1 flex lg:flex-row flex-col items-center justify-center">
            <div className="flex w-full lg:w-[80%] lg:h-full rounded-lg p-4  border border-borderColor/60">
                <Line
                    data={getChartData()}
                    options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                mode: "index",
                                intersect: false,
                                titleColor: "#fff",
                                bodyColor: "#fff",
                                borderColor: "#aaa",
                                borderWidth: 1,
                            },
                        },
                        scales: {
                            x: {
                                ticks: {
                                    maxTicksLimit: 10,
                                    autoSkip: true,
                                    color: "#888",
                                },
                                grid: {
                                    display: false,
                                },
                            },
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: value => `S$${value}`,
                                    color: "#888",
                                },
                                grid: {
                                    color: "#eee",
                                    borderDash: [4, 4],
                                },
                            }
                        }
                    }}
                    height={350}
                />
            </div>
            <div className="flex w-full lg:w-[20%] h-full items-center justify-center flex-col px-4 gap-6 py-6 lg:py-0">

                <div className="flex w-full lg:flex-col flex-row gap-6">
                    <div className="flex flex-col w-full items-center">
                        <h3 className="text-sm lg:text-lg">Net Volume</h3>
                        <h1 className="text-2xl lg:text:4xl">
                            S${grossVolumes.reduce((acc, curr) => (acc + curr.grossVolume) * 0.99, 0).toFixed(2)}
                        </h1>
                    </div>

                    <div className="flex flex-col w-full items-center">
                        <h3 className="text-sm lg:text-lg">Gross Volume</h3>
                        <h1 className="text-2xl lg:text:4xl">
                            S${grossVolumes.reduce((acc, curr) => acc + curr.grossVolume, 0).toFixed(2)}
                        </h1>
                    </div>
                </div>

                <div className="flex w-full lg:flex-col flex-row gap-6">
                    <div className="flex flex-col w-full items-center">
                        <h3 className="text-sm lg:text-lg">
                            Total Sales
                        </h3>
                        <h1 className="text-2xl lg:text:4xl">
                            {(() => {
                                const totalSales = myProducts.reduce((acc, product) => acc + product.sales.length, 0);
                                return totalSales === 0 ? "N/A" : totalSales;
                            })()}
                        </h1>
                    </div>

                    <div className="flex flex-col w-full items-center">
                        <h3 className="text-sm lg:text-lg">
                            Products
                        </h3>
                        <h1 className="text-2xl lg:text:4xl">
                            {myProducts.length === 0 ? "N/A" : myProducts.length}
                        </h1>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Visualisation