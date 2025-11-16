import { TbTruckDelivery, TbPackage, TbBox, TbChecks, TbClock } from 'react-icons/tb'
import { FiPackage, FiTruck } from 'react-icons/fi'
import { BiPackage } from 'react-icons/bi'
import { IoMdCheckmarkCircleOutline, IoMdPrint } from 'react-icons/io'

export const ORDER_STATUS_ICONS = {
    TbTruckDelivery,
    TbPackage,
    TbBox,
    TbChecks,
    FiPackage,
    FiTruck,
    IoMdCheckmarkCircleOutline,
    IoMdPrint,
    TbClock,
    BiPackage
}

export const getStatusIcon = (iconName) => {
    return ORDER_STATUS_ICONS[iconName] || TbPackage
}

export const AVAILABLE_STATUS_ICONS = [
    { name: 'TbTruckDelivery', component: TbTruckDelivery, label: 'Truck Delivery' },
    { name: 'TbPackage', component: TbPackage, label: 'Package' },
    { name: 'TbBox', component: TbBox, label: 'Box' },
    { name: 'TbChecks', component: TbChecks, label: 'Checks' },
    { name: 'FiPackage', component: FiPackage, label: 'Package Outline' },
    { name: 'FiTruck', component: FiTruck, label: 'Truck Outline' },
    { name: 'IoMdCheckmarkCircleOutline', component: IoMdCheckmarkCircleOutline, label: 'Check Circle' },
    { name: 'IoMdPrint', component: IoMdPrint, label: 'Print' },
    { name: 'TbClock', component: TbClock, label: 'Clock' },
    { name: 'BiPackage', component: BiPackage, label: 'Package Alt' },
]
