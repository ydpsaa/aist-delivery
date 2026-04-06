import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { AddressDetails } from "@/services/googlePlacesService";

export type ServiceType = "express" | "standard" | "cargo" | "sameday";
export type OrderStatus = "pending" | "assigned" | "picked" | "delivered";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface AddressEntry {
  label: string;
  coords: LatLng;
  details?: AddressDetails;
}

export interface Order {
  id: string;
  pickup: string;
  dropoff: string;
  service: ServiceType;
  price: number;
  eta: string;
  status: OrderStatus;
  courier?: {
    name: string;
    rating: number;
    initials: string;
  };
  createdAt: Date;
}

interface AppContextType {
  currentOrder: Order | null;
  orderHistory: Order[];

  pickup: string;
  dropoff: string;
  pickupCoords: LatLng | null;
  dropoffCoords: LatLng | null;
  pickupDetails: AddressDetails;
  dropoffDetails: AddressDetails;

  selectedService: ServiceType;

  setPickup: (val: string) => void;
  setDropoff: (val: string) => void;
  setPickupCoords: (val: LatLng | null) => void;
  setDropoffCoords: (val: LatLng | null) => void;
  setPickupDetails: (val: AddressDetails) => void;
  setDropoffDetails: (val: AddressDetails) => void;

  setSelectedService: (s: ServiceType) => void;
  placeOrder: () => void;
  clearCurrentOrder: () => void;

  tipAmount: number;
  setTipAmount: (val: number) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [pickupCoords, setPickupCoords] = useState<LatLng | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<LatLng | null>(null);
  const [pickupDetails, setPickupDetails] = useState<AddressDetails>({});
  const [dropoffDetails, setDropoffDetails] = useState<AddressDetails>({});
  const [selectedService, setSelectedService] = useState<ServiceType>("express");
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  const [tipAmount, setTipAmount] = useState(0);

  const placeOrder = useCallback(() => {
    const order: Order = {
      id: `AIST-${Math.floor(2800 + Math.random() * 200)}`,
      pickup,
      dropoff,
      service: selectedService,
      price: 229,
      eta: "~15 min",
      status: "assigned",
      createdAt: new Date(),
    };
    setCurrentOrder(order);
    setOrderHistory((prev) => [order, ...prev]);
  }, [pickup, dropoff, selectedService]);

  const clearCurrentOrder = useCallback(() => {
    setCurrentOrder((prev) => {
      if (prev) {
        const delivered = { ...prev, status: "delivered" as const };
        setOrderHistory((history) =>
          history.map((o) => (o.id === delivered.id ? delivered : o))
        );
      }
      return null;
    });
    setDropoff("");
    setDropoffCoords(null);
    setDropoffDetails({});
    setTipAmount(0);
  }, []);

  return (
    <AppContext.Provider
      value={{
        currentOrder,
        orderHistory,
        pickup,
        dropoff,
        pickupCoords,
        dropoffCoords,
        pickupDetails,
        dropoffDetails,
        selectedService,
        setPickup,
        setDropoff,
        setPickupCoords,
        setDropoffCoords,
        setPickupDetails,
        setDropoffDetails,
        setSelectedService,
        placeOrder,
        clearCurrentOrder,
        tipAmount,
        setTipAmount,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
