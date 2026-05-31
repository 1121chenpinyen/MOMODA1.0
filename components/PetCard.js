import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';

export default function PetCard({ pet, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <Image source={{ uri: pet.image }} style={styles.image} />
      <Text style={styles.name}>{pet.name}</Text>
      <Text>飢餓: {pet.hunger}</Text>
      <Text>心情: {pet.happiness}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    margin: 10,
    padding: 10,
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: '#fff',
    width: 150
  },
  image: {
    width: 100,
    height: 100,
    marginBottom: 5,
    borderWidth: 3,
    borderColor: '#a29add',
    borderRadius: 14,
    overflow: 'hidden'
  },
  name: { fontWeight: 'bold', marginBottom: 5 }
});