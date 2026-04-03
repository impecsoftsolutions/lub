import { create } from "zustand";

export type Product = {
  id: string;
  name: string;
  image: string;
  price: number;
  category: string;
};

export type ProductCategory = {
  id: string;
  name: string;
  icon: string;
};

export type CartItem = {
  product: Product;
  quantity: number;
};

export type TableStatus = "available" | "occupied" | "reserved";

export type Table = {
  id: string;
  name: string;
  status: TableStatus;
  category: string;
};

export type TableCategory = {
  id: string;
  name: string;
};

export type Order = {
  id: string;
  tableId?: string;
  items: CartItem[];
  status: "active" | "completed" | "cancelled";
  total: number;
  createdAt: Date;
};

type Store = {
  orders: Order[];
  cart: CartItem[];

  addToCart: (product: Product, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;

  createOrder: () => void;
  assignOrderToTable: (tableId: string) => void;
};

export const useStore = create<Store>((set, get) => ({
  orders: [],
  cart: [],

  addToCart: (product, quantity = 1) => {
    set((state) => {
      // Check if product already exists in cart
      const existingItem = state.cart.find((item) => item.product.id === product.id);

      if (existingItem) {
        // Increase quantity if product already in cart
        return {
          cart: state.cart.map((item) =>
            item.product.id === product.id ? { ...item, quantity: item.quantity + quantity } : item
          )
        };
      } else {
        // Add new product to cart with specified quantity
        return { cart: [...state.cart, { product, quantity }] };
      }
    });
  },

  updateQuantity: (productId, quantity) => {
    set((state) => {
      if (quantity <= 0) {
        // Remove item if quantity is 0 or negative
        return { cart: state.cart.filter((item) => item.product.id !== productId) };
      } else {
        // Update quantity
        return {
          cart: state.cart.map((item) =>
            item.product.id === productId ? { ...item, quantity } : item
          )
        };
      }
    });
  },

  removeFromCart: (productId) => {
    set((state) => ({
      cart: state.cart.filter((item) => item.product.id !== productId)
    }));
  },

  createOrder: () => {
    const { cart } = get();

    if (cart.length === 0) return;

    // Calculate total
    const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const tax = subtotal * 0.05;
    const total = subtotal + tax;

    const newOrder: Order = {
      id: `order-${Date.now()}`,
      items: [...cart],
      status: "active",
      total: total,
      createdAt: new Date()
    };

    set((state) => ({
      orders: [...state.orders, newOrder],
      showAssignOrderDialog: true
    }));
  },

  assignOrderToTable: (tableId) => {
    const { cart, orders } = get();

    if (cart.length === 0 || orders.length === 0) return;

    // Find the latest order (the one we just created)
    const latestOrder = orders[orders.length - 1];

    // Update the order with the table ID
    const updatedOrder = { ...latestOrder, tableId };

    set((state) => ({
      // Update orders
      orders: [...state.orders.slice(0, -1), updatedOrder],

      // Clear cart and close dialog
      cart: [],
      showAssignOrderDialog: false
    }));
  }
}));
