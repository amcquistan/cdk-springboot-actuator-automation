package com.thecodinginterface.actuatorawsautomation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@SpringBootApplication(exclude = {
		SecurityAutoConfiguration.class })
public class ActuatorAwsAutomationApplication {

	final static Logger logger = LoggerFactory.getLogger(ActuatorAwsAutomationApplication.class);

	public static void main(String[] args) {
		SpringApplication.run(ActuatorAwsAutomationApplication.class, args);
	}

	@GetMapping("greet/{name}")
	public Map<String, String> greet(@PathVariable String name) {
		logger.info("Greeting {}", name);

		if (name.equalsIgnoreCase("two-face")) {
			logger.warn("Be careful greeting sketchy characters");
		}

		if (name.equalsIgnoreCase("joker")) {
			logger.error("Report criminal to authorities.");
		}

		return Map.of("greetings", "Hello " + name);
	}
}
