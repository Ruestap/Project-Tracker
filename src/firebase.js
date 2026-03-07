import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDHE1QsC5fi3N-b0MJANgDKevbgNTaeJ2c",
  authDomain: "project-tracker-corp.firebaseapp.com",
  projectId: "project-tracker-corp",
  storageBucket: "project-tracker-corp.firebasestorage.app",
  messagingSenderId: "721610681740",
  appId: "1:721610681740:web:7b9a9dcd460f888a117aa9"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
