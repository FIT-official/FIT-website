import { services } from "@/lib/services"
import Image from "next/image";


function MobileServicesComponent() {
    return (
        <div className="flex w-full flex-col gap-12 py-4">
            {services.map((card, index) => (
                <div
                    key={index}
                    className="flex flex-col w-full aspect-square border-borderColor border rounded-xl bg-baseColor"
                >
                    <div className="relative w-full h-1/2">
                        <Image
                            src={card.image || '/bg5.jpg'}
                            alt={card.title}
                            fill
                            className="rounded-t-xl object-cover"
                            style={{ objectFit: "cover" }}
                        />
                    </div>
                    <div className="flex flex-col h-1/2 p-8 justify-center">
                        <p className="flex text-lightColor font-semibold uppercase text-xs">Service</p>
                        <h2 className="font-semibold text-lg mb-2">{card.title}</h2>
                        <p className=" font-normal text-pretty text-xs">{card.description}</p>
                    </div>
                </div>
            ))}
        </div>
    )
}

export default MobileServicesComponent