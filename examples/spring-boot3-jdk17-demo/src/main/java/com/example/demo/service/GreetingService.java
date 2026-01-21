package com.example.demo.service;

import com.example.demo.model.Greeting;
import org.springframework.stereotype.Service;

@Service
public class GreetingService {
  public Greeting greet(String name) {
    return Greeting.of(name);
  }
}

